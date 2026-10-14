let deviceKeyPairPromise = null;

function toBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function getDeviceKeyPair() {
  if (!deviceKeyPairPromise) {
    deviceKeyPairPromise = (async () => {
      const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign', 'verify']
      );
      const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
      const pubBase64 = toBase64Url(new TextEncoder().encode(JSON.stringify({
        kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y,
      })));
      return { privateKey: pair.privateKey, pubBase64 };
    })();
  }
  return deviceKeyPairPromise;
}

export async function createSignedHeaders(method, path, userId) {
  const { privateKey, pubBase64 } = await getDeviceKeyPair();
  const timestamp = String(Date.now());
  const url = new URL(path, window.location.origin);
  const payload = new TextEncoder().encode(`${method.toUpperCase()}:${url.pathname}:${userId}:${timestamp}`);
  const sigBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    payload
  );
  return {
    'X-Device-Public-Key': pubBase64,
    'X-Device-Signature': toBase64Url(sigBuffer),
    'X-Device-Timestamp': timestamp,
  };
}

export function createDeviceApproval({ getSession, onAccessChange, status }) {
  let generation = 0;
  function invalidate(message = '기기 승인: 확인 정보 없음') {
    ++generation;
    onAccessChange(false);
    status.textContent = message;
  }
  async function call(method) {
    const version = generation;
    const before = await getSession();
    if (version !== generation) return null;
    if (before.error || !before.data?.session) {
      invalidate('기기 승인: 로그인 후 확인해 주세요.');
      return null;
    }
    const session = before.data.session;
    const signedHeaders = await createSignedHeaders(method, '/api/device-approval', session.user.id);
    const response = await fetch('/api/device-approval', {
      method, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...signedHeaders,
      },
    });
    const data = await response.json();
    const after = await getSession();
    if (version !== generation) return null;
    if (after.error || after.data?.session?.user.id !== session.user.id
        || after.data.session.access_token !== session.access_token) {
      invalidate('기기 승인: 로그인 상태가 변경됐습니다. 다시 확인해 주세요.');
      return null;
    }
    if (!response.ok) {
      invalidate('기기 승인: 서버 확인 실패 · 자료실이 잠겨 있습니다.');
      return null;
    }
    return data;
  }
  async function check() {
    try {
      const data = await call('GET');
      if (!data) return false;
      if (data.state === 'approved' && data.deviceRegistered === true) {
        onAccessChange(true);
        status.textContent = '기기 승인: 서버 확인 완료 · 자료실이 열렸습니다.';
        return true;
      }
      invalidate(data.state === 'pending'
        ? '기기 승인: 심사 대기 · 자료실이 잠겨 있습니다.'
        : '기기 승인: 미승인 기기 · 승인 요청 후 서버 확인이 필요합니다.');
      return false;
    } catch {
      invalidate('기기 승인: 서버에 연결할 수 없습니다. 자료실이 잠겨 있습니다.');
      return false;
    }
  }
  async function requestApproval() {
    invalidate('기기 승인: 요청을 보내는 중입니다.');
    try {
      const result = await call('POST');
      return result ? await check() : false;
    } catch {
      invalidate('기기 승인: 요청 결과를 확인할 수 없습니다. 자료실이 잠겨 있습니다.');
      return false;
    }
  }
  return { check, requestApproval, invalidate, signHeaders: createSignedHeaders };
}
