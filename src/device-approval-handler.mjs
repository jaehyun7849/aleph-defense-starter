import { createVerify, createHash } from 'node:crypto';

// 계정별 승인된 기기 공개키 지문(fingerprint)과 공개키 JWK를 저장합니다.
const approvedDevices = new Map();

function getKeyFingerprint(jwk) {
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    return null;
  }
  return createHash('sha256').update(`EC:P-256:${jwk.x}:${jwk.y}`).digest('hex');
}

export function verifyDeviceSignature(req, userId) {
  const pubHeader = req.headers['x-device-public-key'];
  const sigHeader = req.headers['x-device-signature'];
  const tsHeader = req.headers['x-device-timestamp'];
  if (!pubHeader || !sigHeader || !tsHeader) return { verified: false, registered: false };

  const timestamp = Number(tsHeader);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 300000) {
    return { verified: false, registered: false };
  }

  let jwk;
  try {
    jwk = JSON.parse(Buffer.from(pubHeader, 'base64url').toString('utf8'));
  } catch {
    return { verified: false, registered: false };
  }

  const fingerprint = getKeyFingerprint(jwk);
  if (!fingerprint) return { verified: false, registered: false };

  try {
    const url = new URL(req.url, 'https://local.invalid');
    const payload = `${req.method}:${url.pathname}:${userId}:${timestamp}`;
    const verify = createVerify('SHA256');
    verify.update(payload);
    verify.end();
    const valid = verify.verify(
      { key: jwk, format: 'jwk' },
      Buffer.from(sigHeader, 'base64url'),
      'ieee-p1363'
    );
    if (!valid) return { verified: false, registered: false };
  } catch {
    return { verified: false, registered: false };
  }

  const userKey = `${userId.toLowerCase()}:${fingerprint}`;
  const registered = approvedDevices.has(userKey);
  return { verified: true, registered, fingerprint, userKey };
}

export function approveDevice(userKey, jwk) {
  approvedDevices.set(userKey, { jwk, approvedAt: Date.now() });
}

export function createDeviceApprovalHandler({ verifyLogin }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const respond = (status, state, deviceRegistered, reasonCode, error = undefined) =>
      res.status(status).json({
        schema: 'aleph.device-approval.v1',
        state,
        deviceRegistered,
        reasonCode,
        ...(error ? { error } : {}),
      });

    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return respond(405, 'denied', false, 'method_not_allowed', '지원하지 않는 요청입니다.');
    }
    const url = new URL(req.url, 'https://local.invalid');
    if (url.pathname !== '/api/device-approval' || url.search) {
      return respond(404, 'denied', false, 'resource_not_allowed', '허용된 경로가 아닙니다.');
    }
    if (!req.headers.authorization) {
      return respond(401, 'unauthenticated', false, 'login_required', '로그인이 필요합니다.');
    }
    let actor;
    try { actor = await verifyLogin(req.headers.authorization); } catch {}
    if (!actor || !actor.userId) {
      return respond(401, 'unauthenticated', false, 'invalid_login', '로그인을 확인할 수 없습니다.');
    }

    const check = verifyDeviceSignature(req, actor.userId);
    if (!check.verified) {
      if (req.method === 'GET') {
        return respond(200, 'unregistered', false, 'device_signature_missing');
      }
      return respond(403, 'denied', false, 'device_signature_required', '기기 서명이 확인되지 않았습니다.');
    }

    if (req.method === 'POST') {
      approveDevice(check.userKey);
      return respond(200, 'approved', true, 'device_approved');
    }

    if (check.registered) {
      return respond(200, 'approved', true, 'device_approved');
    }
    return respond(200, 'unregistered', false, 'device_not_registered');
  };
}
