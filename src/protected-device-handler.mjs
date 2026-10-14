// Existing data authorization stays in handler. Stage 11 additionally requires
// an engine-verified device on the data path. No such contract is connected yet;
// do not turn a login, UI badge, header, cookie or body into device evidence.
export function protectDeviceRequests({ handler, verifyLogin, config }) {
  return async (req, res) => {
    if (config.step < 11) return handler(req, res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const deny = (status, reasonCode, error) => res.status(status).json({ error, reasonCode });
    if (!req.headers.authorization) return deny(401, 'login_required', '로그인이 필요합니다.');
    let actor;
    try { actor = await verifyLogin(req.headers.authorization); } catch {}
    if (!actor) return deny(401, 'invalid_login', '유효한 로그인이 필요합니다.');
    // Fail before invoking any data handler, including reads, writes and restore.
    // This is deliberate until a verified engine/device contract is available.
    return deny(403, 'device_approval_unavailable', '기기 증명을 확인할 수 없어 자료 요청을 거부합니다.');
  };
}
