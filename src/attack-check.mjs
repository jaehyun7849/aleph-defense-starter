// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step >= 2) return runProtectionChecks(config);
  if (config.step !== 1) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}

async function runProtectionChecks(config) {
  const app = new URL(config.publicAppUrl);
  if (app.protocol !== 'https:' || app.username || app.password
      || app.search || app.hash || app.pathname !== '/'
      || !app.hostname.endsWith('.vercel.app')) {
    throw new Error('설정의 실제 Vercel 운영 주소를 확인하세요.');
  }
  const attempts = [];
  async function check(attackId, path, expected, accepts, authorization) {
    try {
      const response = await fetch(new URL(path, app), {
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: authorization ? { Authorization: authorization } : {},
      });
      let data = null;
      if (response.headers.get('content-type')?.includes('application/json')) {
        try { data = await response.json(); } catch {}
      }
      const success = accepts(response, data);
      attempts.push({ attackId, expected,
        observed: `HTTP ${response.status}; 직접 점검 ${success ? '통과' : '실패'}` });
    } catch {
      attempts.push({ attackId, expected,
        observed: '요청 실패; 해당 응답 조건은 확인하지 못함' });
    }
  }
  const denied = (response, data) =>
    [401, 403].includes(response.status)
      && typeof data?.error === 'string' && !('notes' in data);
  await check('anonymous_note_read', '/api/notes',
    '무로그인 목록 요청은 401 또는 403 JSON 오류로 거부', denied);
  await check('anonymous_note_item', '/api/notes/00000000-0000-4000-8000-000000000001',
    '무로그인 개별 메모 요청은 401 또는 403 JSON 오류로 거부', denied);
  await check('invalid_login_token', '/api/notes',
    '유효하지 않은 로그인 토큰은 JSON 오류로 거부', denied, 'Bearer invalid');
  await check('static_notes_removed', '/data.json',
    '공개 JSON은 404 또는 메모 0건이고 확인 표시가 없음',
    (response, data) => response.status === 404
      || (response.ok && Array.isArray(data?.notes) && data.notes.length === 0
        && !data.sampleMarker));
  await check('deployment_metadata', '/aleph.json',
    '배포 메타데이터 JSON의 단계가 현재 설정과 일치',
    (response, data) => response.ok && data?.step === config.step
      && /^[a-f0-9]{40}$/i.test(data?.commit ?? ''));
  await check('home_security_header', '/',
    '첫 화면에 nosniff 또는 CSP 헤더가 있음',
    response => response.ok
      && (response.headers.get('x-content-type-options') === 'nosniff'
        || Boolean(response.headers.get('content-security-policy'))));
  if (config.step >= 4) {
    attempts.push(await checkAnonymousDatabase(config));
  }
  return attempts;
}

async function checkAnonymousDatabase(config) {
  const expected = '공개용 키만 사용한 DB 직접 읽기는 권한 오류로 거부';
  try {
    const issuer = new URL(config.identityProvider.issuer);
    if (issuer.protocol !== 'https:' || issuer.username || issuer.password
        || issuer.port || issuer.search || issuer.hash
        || issuer.pathname !== '/auth/v1'
        || !/^[a-z0-9-]+\.supabase\.co$/.test(issuer.hostname)) {
      throw new Error('invalid_database_origin');
    }
    const response = await fetch(new URL('/rest/v1/notes?select=id&limit=1', issuer.origin), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { apikey: 'sb_publishable_KCBRXcZaX0rKlgxb6wVvZg_ad5fzavC' },
    });
    let data = null;
    try { data = await response.json(); } catch {}
    const success = [401, 403].includes(response.status) && data?.code === '42501';
    return { attackId: 'anonymous_database_read', expected,
      observed: `HTTP ${response.status}; 권한 거부 확인 ${success ? '통과' : '실패'}` };
  } catch {
    return { attackId: 'anonymous_database_read', expected,
      observed: '요청 실패; DB 직접 읽기 거부를 확인하지 못함' };
  }
}
