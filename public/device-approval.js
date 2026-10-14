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
      // This shape belongs to this UI adapter, not to an invented engine API.
      // The current production adapter only returns 503, never this success.
      const approved = data.schema === 'aleph.device-approval.v1'
        && data.state === 'approved' && data.deviceRegistered === true
        && /^[a-f0-9]{16}$/.test(data.deviceId ?? '');
      if (!approved) {
        invalidate(data.state === 'pending' ? '기기 승인: 심사 대기 · 자료실이 잠겨 있습니다.'
          : '기기 승인: 미승인 또는 확인 불가 · 자료실이 잠겨 있습니다.');
        return false;
      }
      status.textContent = '기기 승인: 서버가 이 기기의 등록 상태를 확인했습니다.';
      onAccessChange(true);
      return true;
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
