// This local UI endpoint is NOT an engine approval contract. Until a verified
// per-device engine channel exists, it never grants or queues approval.
export function createDeviceApprovalHandler({ verifyLogin }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const deny = (status, reasonCode, error) => res.status(status).json({
      schema: 'aleph.device-approval.v1', state: 'unavailable',
      deviceRegistered: false, reasonCode, error,
    });
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return deny(405, 'method_not_allowed', '지원하지 않는 요청입니다.');
    }
    const url = new URL(req.url, 'https://local.invalid');
    if (url.pathname !== '/api/device-approval' || url.search)
      return deny(404, 'resource_not_allowed', '허용된 경로가 아닙니다.');
    if (!req.headers.authorization) return deny(401, 'login_required', '로그인이 필요합니다.');
    let actor;
    try { actor = await verifyLogin(req.headers.authorization); } catch {}
    if (!actor) return deny(401, 'invalid_login', '로그인을 확인할 수 없습니다.');
    // Neither the login identity nor a client header/body identifies an
    // approved device. No key generation, registration write or DB request.
    return deny(503, 'device_approval_unavailable', '기기 승인 서버 연결이 준비되지 않았습니다.');
  };
}
