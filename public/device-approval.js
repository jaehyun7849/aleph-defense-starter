// A UI gate only. Actual per-device verification must also be enforced by the
// provided engine on the data path. Installation/storage values are not read.
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
    const response = await fetch('/api/device-approval', {
      method, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${session.access_token}` },
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
      invalidate(response.status === 503 && data?.reasonCode === 'device_approval_unavailable'
        ? '기기 승인: 서버 연결 미준비 · 승인 요청이 접수되지 않았습니다.'
        : '기기 승인: 서버 확인 실패 · 자료실이 잠겨 있습니다.');
      return null;
    }
    return data;
  }
  async function check() {
    try {
      const data = await call('GET');
      if (!data) return false;
      // The connected engine proof contract is absent. Even an "approved"
      // label in JSON is not a verified device proof and must not unlock data.
      invalidate(data.state === 'pending' ? '기기 승인: 심사 대기 · 자료실이 잠겨 있습니다.'
        : '기기 승인: 검증된 기기 연결이 없습니다. 자료실이 잠겨 있습니다.');
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
      // A button click or POST response never grants access; recheck by GET.
      return result ? await check() : false;
    } catch {
      invalidate('기기 승인: 요청 결과를 확인할 수 없습니다. 자료실이 잠겨 있습니다.');
      return false;
    }
  }
  return { check, requestApproval, invalidate };
}
