import { randomUUID } from 'node:crypto';
import { UUID, readResourcePolicy, matchResourceRoute, resourceKind,
  resourceId, canAccessResource } from './resource-policy.mjs';

function readBody(req) {
  const value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200
      || typeof value.body !== 'string' || value.body.length > 10000) throw new Error('invalid_body');
  return value;
}

function apiResourceRoute(rawUrl) {
  const url = new URL(rawUrl, 'https://local.invalid');
  // Vercel can pass the dynamic function destination and its captured id.
  // This is routing only: never infer ownership or role from query values.
  const template = /^\/api\/(notes|notices)\/\[id\]$/.exec(url.pathname);
  const entries = [...url.searchParams];
  let path = url.pathname;
  if (template) {
    if (entries.length !== 1 || entries[0][0] !== 'id' || !UUID.test(entries[0][1])) return null;
    path = `/api/${template[1]}/${entries[0][1]}`;
  }
  const route = matchResourceRoute(path, 'GET', { api: true });
  if (!route) return null;
  // A captured id may also be appended to the concrete URL. It must repeat
  // its path id exactly, never select another resource or a collection item.
  if (url.search && (!route.id || entries.length !== 1 || entries[0][0] !== 'id'
      || entries[0][1].toLowerCase() !== route.id)) return null;
  return route;
}

export function createNotesHandler({ createClient, verifyLogin, env = process.env }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = (status, reasonCode, message) => res.status(status).json({ error: message, reasonCode });
    if (!req.headers.authorization) return fail(401, 'login_required', '로그인이 필요합니다.');
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return fail(500, 'server_configuration', '서버 환경변수를 확인하세요.');
    let identity, policy;
    try {
      identity = await verifyLogin(req.headers.authorization);
      policy = readResourcePolicy(env.VAULT_RESOURCE_POLICY);
    } catch { return fail(500, 'server_configuration', '서버 로그인·자원 설정을 확인하세요.'); }
    if (!identity || !UUID.test(identity.userId ?? '')) return fail(401, 'invalid_login', '유효한 로그인이 필요합니다.');

    const route = apiResourceRoute(req.url);
    if (!route) return fail(404, 'resource_not_allowed', '허용된 자료 경로가 아닙니다.');
    const allowed = route.collection ? ['GET', 'POST'] : ['GET', 'PUT', 'DELETE'];
    if (!allowed.includes(req.method)) {
      res.setHeader('Allow', allowed.join(', '));
      return fail(405, 'method_not_allowed', '지원하지 않는 요청 방식입니다.');
    }
    const userId = identity.userId.toLowerCase();
    const isInstructor = policy.instructorUserIds.has(userId);
    const stamp = row => ({ ...row, resourceId: resourceId(resourceKind(row.id, policy), row.id) });
    let payload;
    if (['POST', 'PUT'].includes(req.method)) {
      try {
        payload = readBody(req);
        if (req.method === 'POST' && payload.id !== undefined
            && (typeof payload.id !== 'string' || !UUID.test(payload.id))) throw new Error('invalid_id');
      } catch { return fail(400, 'invalid_body', '제목·본문·UUID 형식을 확인하세요.'); }
      if (Object.hasOwn(payload, 'owner_id') && payload.owner_id !== identity.userId) {
        return fail(403, 'resource_forbidden', '메모 소유자를 변경할 수 없습니다.');
      }
    }
    try {
      const db = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      if (route.collection && req.method === 'GET') {
        const ids = [...policy.noticeIds];
        res.setHeader('X-Resource-Id', route.kind === 'personal_note' ? 'personal_note:collection' : 'instructor_notice:collection');
        let query = db.from('notes').select('id,title,body');
        if (route.kind === 'personal_note') {
          query = query.eq('owner_id', userId);
          if (ids.length) query = query.not('id', 'in', `(${ids.join(',')})`);
        } else {
          if (!ids.length) return res.status(200).json([]);
          query = query.in('id', ids);
        }
        const { data, error } = await query.order('id');
        if (error) throw error;
        return res.status(200).json(data.map(stamp));
      }
      if (route.collection && req.method === 'POST') {
        const id = payload.id?.toLowerCase() ?? randomUUID();
        const kind = resourceKind(id, policy);
        if (kind !== route.kind || !canAccessResource({ userId, isInstructor,
          resource: { kind, ownerUserId: userId }, method: 'POST' })) {
          return fail(403, 'resource_forbidden', '이 자원에는 자료를 만들 수 없습니다.');
        }
        res.setHeader('X-Resource-Id', resourceId(kind, id));
        const { data, error } = await db.from('notes').insert({ id,
          title: payload.title.trim(), body: payload.body, owner_id: userId }).select('id').single();
        if (error?.code === '23505') return fail(409, 'duplicate_id', '이미 존재하는 메모 ID입니다.');
        if (error) throw error;
        return res.status(201).json(stamp(data));
      }
      const kind = resourceKind(route.id, policy);
      res.setHeader('X-Resource-Id', resourceId(kind, route.id));
      if (route.kind === 'instructor_notice' && kind !== route.kind) {
        return fail(404, 'resource_not_allowed', '공지를 찾을 수 없습니다.');
      }
      // No title/body is fetched before checking stored owner and permission.
      const meta = await db.from('notes').select('owner_id').eq('id', route.id).maybeSingle();
      if (meta.error) throw meta.error;
      if (!meta.data) return fail(404, 'resource_not_found', '자료를 찾을 수 없습니다.');
      if (!canAccessResource({ userId, isInstructor,
        resource: { kind, ownerUserId: meta.data.owner_id }, method: req.method })) {
        return fail(kind === 'personal_note' ? 404 : 403, 'resource_forbidden', '이 자료에 접근할 수 없습니다.');
      }
      let query = db.from('notes');
      if (req.method === 'GET') query = query.select('id,title,body');
      else if (req.method === 'PUT') query = query.update({
        title: payload.title.trim(), body: payload.body, content: payload.body });
      else query = query.delete();
      query = query.eq('id', route.id);
      if (kind === 'personal_note') query = query.eq('owner_id', userId);
      if (req.method !== 'GET') query = query.select(req.method === 'DELETE' ? 'id' : 'id,title,body');
      const result = await query.maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return fail(404, 'resource_not_found', '자료를 찾을 수 없습니다.');
      if (req.method === 'DELETE') return res.status(204).end();
      return res.status(200).json(stamp(result.data));
    } catch { return fail(502, 'database_failed', 'DB 작업에 실패했습니다. 서버 설정을 확인하세요.'); }
  };
}
