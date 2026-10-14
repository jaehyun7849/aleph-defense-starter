// Existing data authorization stays in handler. Production routes can inject
// the server-managed demo session verifier. Without a verifier, stage 11 stays
// closed. A demo page approval is not hardware device identity evidence.
export function protectDeviceRequests({ handler, verifyLogin, config, verifyDemoAccess }) {
  return async (req, res) => {
    if (config.step < 11) return handler(req, res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const deny = (status, reasonCode, error) => res.status(status).json({ error, reasonCode });
    if (!req.headers.authorization) return deny(401, 'login_required', '로그인이 필요합니다.');
    let actor;
    try { actor = await verifyLogin(req.headers.authorization); } catch {}
    if (!actor) return deny(401, 'invalid_login', '유효한 로그인이 필요합니다.');
    if (verifyDemoAccess) {
      let approved = false;
      try { approved = await verifyDemoAccess(req, actor) === true; } catch {}
      if (!approved) return deny(403, 'demo_not_approved', '서버의 데모 승인 확인 전에는 자료를 열 수 없습니다.');
      // Approval of this page session is an additional gate. Existing ownership
      // and resource authorization must still run in the original handler.
      return handler(req, res);
    }
    // Fail before invoking any data handler, including reads, writes and restore.
    // This is deliberate until a verified engine/device contract is available.
    return deny(403, 'device_approval_unavailable', '기기 증명을 확인할 수 없어 자료 요청을 거부합니다.');
  };
}
