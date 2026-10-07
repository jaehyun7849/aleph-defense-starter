// Each request gets its own SDK client; user sessions never enter the DB client.
export function createAuthHandler(createClient) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'POST 요청을 사용하세요.' });
    }
    const origin = req.headers.origin;
    if (origin) {
      try {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'https:' || parsed.host !== req.headers.host
            || parsed.origin !== origin) throw new Error();
      } catch {
        return res.status(403).json({ error: '같은 사이트에서 요청하세요.' });
      }
    }
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
      return res.status(415).json({ error: 'JSON으로 요청하세요.' });
    }
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
      const validString = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
      if (body.action === 'login') {
        if (!validString(body.email, 320) || !validString(body.password, 4096)) throw new Error();
      } else if (body.action === 'refresh') {
        if (!validString(body.refresh_token, 8192)) throw new Error();
      } else if (body.action === 'logout') {
        if (!validString(body.access_token, 8192)) throw new Error();
      } else throw new Error();
    } catch {
      return res.status(400).json({ error: '로그인 요청 형식을 확인하세요.' });
    }
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) return res.status(500).json({ error: '서버의 로그인 환경변수를 확인하세요.' });
    try {
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      if (body.action === 'logout') {
        const { error } = await client.auth.admin.signOut(body.access_token, 'local');
        if (error) return res.status(401).json({ error: '로그아웃 요청을 확인할 수 없습니다.' });
        return res.status(204).end();
      }
      const result = body.action === 'login'
        ? await client.auth.signInWithPassword({ email: body.email.trim(), password: body.password })
        : await client.auth.refreshSession({ refresh_token: body.refresh_token });
      if (result.error || !result.data?.session) {
        return res.status(401).json({ error: body.action === 'login'
          ? '이메일과 비밀번호를 확인하세요.' : '세션이 만료되었습니다. 다시 로그인하세요.' });
      }
      const session = result.data.session;
      return res.status(200).json({ session: {
        access_token: session.access_token, refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: { id: session.user.id, email: session.user.email }
      } });
    } catch {
      return res.status(502).json({ error: '로그인 서비스에 연결하지 못했습니다.' });
    }
  };
}
