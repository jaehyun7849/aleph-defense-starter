import { verifyDeviceSignature } from './device-approval-handler.mjs';

export function protectDeviceRequests({ handler, verifyLogin, config }) {
  return async (req, res) => {
    if (config.step < 11) return handler(req, res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const deny = (status, reasonCode, error) => res.status(status).json({ error, reasonCode });
    if (!req.headers.authorization) return deny(401, 'login_required', '로그인이 필요합니다.');
    let actor;
    try { actor = await verifyLogin(req.headers.authorization); } catch {}
    if (!actor || !actor.userId) return deny(401, 'invalid_login', '유효한 로그인이 필요합니다.');

    const check = verifyDeviceSignature(req, actor.userId);
    if (!check.verified || !check.registered) {
      return deny(403, 'device_not_approved', '서버가 확인한 기기 승인과 서명이 필요합니다.');
    }
    return handler(req, res);
  };
}
