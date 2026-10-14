// Demo handle and login credentials live only in this page's memory.
export function createDemoAccess({ getSession, onState, fetcher = fetch }) {
  let sessionToken, generation = 0;
  const show = (state, message, requestId) => onState({ state, message, requestId });
  function reset() {
    ++generation;
    sessionToken = undefined;
    show('unregistered', '데모 승인: 요청 전');
  }
  async function call(path, method = 'GET', body) {
    const version = generation;
    const before = await getSession();
    const session = before.data?.session;
    if (version !== generation || before.error || !session) throw new Error('로그인 후 사용하세요.');
    const response = await fetcher(path, { method, cache: 'no-store', credentials: 'omit',
      signal: AbortSignal.timeout(10000), headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(sessionToken ? { 'X-Demo-Session': sessionToken } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = response.status === 204 ? null : await response.json();
    const after = await getSession();
    if (version !== generation || after.error || after.data?.session?.user.id !== session.user.id
        || after.data?.session?.access_token !== session.access_token) throw new Error('로그인 상태가 바뀌었습니다. 다시 확인하세요.');
    if (!response.ok && !path.startsWith('/api/demo-')
        && (response.status === 401 || result?.reasonCode === 'demo_not_approved')) {
      ++generation;
      show('error', '서버 승인 또는 로그인 상태가 바뀌어 자료실을 잠갔습니다.');
    }
    if (!response.ok || (path.startsWith('/api/demo-') && result?.demo !== true))
      throw new Error(typeof result?.error === 'string' ? result.error
        : result?.reasonCode === 'device_approval_unavailable' ? '승인 요청이 접수되지 않았습니다.' : '서버 응답을 확인할 수 없습니다.');
    return result;
  }
  async function check() {
    const version = ++generation;
    show('checking', '데모 승인: 서버 확인 중');
    try {
      const result = await call('/api/demo-device');
      if (version !== generation) return false;
      if (sessionToken && result.state === 'approved') {
        show('approved', '데모 승인: 서버에서 승인됨', result.requestId);
        return true;
      }
      const state = ['pending', 'revoked'].includes(result.state) ? result.state : 'unregistered';
      show(state, state === 'pending' ? '데모 승인: 관리자 승인 대기'
        : state === 'revoked' ? '데모 승인: 승인 취소됨 · 새로고침 후 다시 요청하세요.' : '데모 승인: 요청 전', result.requestId);
    } catch (error) { if (version === generation) show('error', error.message); }
    return false;
  }
  async function requestApproval() {
    const version = ++generation;
    show('pending', '데모 승인: 요청 접수 중');
    try {
      const result = await call('/api/demo-device', 'POST', { action: 'request' });
      if (version !== generation) return false;
      if (typeof result.sessionToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(result.sessionToken)) sessionToken = result.sessionToken;
      // POST, installation or a displayed badge never opens the demo data.
      return await check();
    } catch (error) { if (version === generation) show('error', error.message); return false; }
  }
  return { reset, check, requestApproval, call };
}
