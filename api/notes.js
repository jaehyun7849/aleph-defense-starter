import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import config from '../aleph.config.json' with { type: 'json' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let verifyLogin;

function readBody(req) {
  let value = req.body;
  if (typeof value === 'string') value = JSON.parse(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('제목과 본문을 JSON으로 보내 주세요.');
  }
  if (typeof value.title !== 'string' || !value.title.trim()
      || value.title.length > 200 || typeof value.body !== 'string'
      || value.body.length > 10000) {
    throw new Error('제목은 1~200자, 본문은 10000자 이내로 입력하세요.');
  }
  return value;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!req.headers.authorization) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: '서버의 Supabase 환경변수를 확인하세요.' });
  }
  let identity;
  try {
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: key });
    identity = await verifyLogin(req.headers.authorization);
  } catch {
    return res.status(500).json({ error: '서버의 로그인 검사 설정을 확인하세요.' });
  }
  if (!identity) {
    return res.status(401).json({ error: '로그인 토큰이 유효하지 않거나 만료되었습니다.' });
  }

  const pathname = new URL(req.url, 'https://local.invalid').pathname;
  const collection = pathname === '/api/notes' || pathname === '/api/notes/';
  const match = /^\/api\/notes\/([^/]+)\/?$/.exec(pathname);
  const id = match?.[1];
  if (!collection && (!id || !UUID.test(id))) {
    return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
  }
  const allowed = collection ? ['GET', 'POST'] : ['GET', 'PUT', 'DELETE'];
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    return res.status(405).json({ error: '지원하지 않는 요청 방식입니다.' });
  }
  let payload;
  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      payload = readBody(req);
      if (req.method === 'POST' && payload.id !== undefined
          && (typeof payload.id !== 'string' || !UUID.test(payload.id))) {
        throw new Error('id는 UUID 형식이어야 합니다.');
      }
    } catch (error) {
      return res.status(400).json({ error: error instanceof SyntaxError
        ? 'JSON 형식을 확인하세요.' : error.message });
    }
  }

  if (payload && Object.hasOwn(payload, 'owner_id')
      && payload.owner_id !== identity.userId) {
    return res.status(403).json({ error: '메모 소유자를 변경할 수 없습니다.' });
  }

  try {
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    if (collection && req.method === 'GET') {
      const { data, error } = await db.from('notes')
        .select('id,title,body').eq('owner_id', identity.userId).order('id');
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (collection && req.method === 'POST') {
      const { data, error } = await db.from('notes').insert({
        id: payload.id ?? randomUUID(),
        title: payload.title.trim(),
        body: payload.body,
        owner_id: identity.userId
      }).select('id').single();
      if (error?.code === '23505') {
        return res.status(409).json({ error: '이미 존재하는 메모 ID입니다.' });
      }
      if (error) throw error;
      return res.status(201).json({ id: data.id });
    }
    // 메모 ID와 서버가 검증한 소유자를 함께 비교합니다.
    let result;
    if (req.method === 'GET') {
      result = await db.from('notes')
        .select('id,title,body').eq('id', id).eq('owner_id', identity.userId).maybeSingle();
    } else if (req.method === 'PUT') {
      result = await db.from('notes').update({
        title: payload.title.trim(), body: payload.body,
        content: payload.body
      }).eq('id', id).eq('owner_id', identity.userId).select('id,title,body').maybeSingle();
    } else {
      result = await db.from('notes').delete()
        .eq('id', id).eq('owner_id', identity.userId).select('id').maybeSingle();
    }
    if (result.error) throw result.error;
    if (!result.data) {
      return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
    }
    if (req.method === 'DELETE') return res.status(204).end();
    return res.status(200).json(result.data);
  } catch {
    return res.status(502).json({ error: 'DB 작업에 실패했습니다. 테이블과 서버 권한을 확인하세요.' });
  }
}

