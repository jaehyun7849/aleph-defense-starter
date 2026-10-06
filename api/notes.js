import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import config from '../aleph.config.json' with { type: 'json' };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      error: 'GET 요청만 가능합니다.'
    });
  }

  if (!req.headers.authorization) {
    return res.status(401).json({
      error: '로그인이 필요합니다.'
    });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return res.status(500).json({
      error: '서버의 Supabase 환경변수 설정이 필요합니다.'
    });
  }

  let identity;

  try {
    const verifyLogin = createLoginVerifier({
      config,
      supabaseSecretKey: key
    });

    identity = await verifyLogin(req.headers.authorization);
  } catch {
    return res.status(500).json({
      error: '서버의 로그인 검사 설정을 확인하세요.'
    });
  }

  if (!identity) {
    return res.status(401).json({
      error: '로그인 토큰이 유효하지 않거나 만료되었습니다.'
    });
  }

  try {
    const supabase = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const { data, error } = await supabase
      .from('notes')
      .select('id, title, content')
      .order('id');

    if (error) {
      return res.status(502).json({
        error: 'DB 조회에 실패했습니다.'
      });
    }

    return res.status(200).json({ notes: data });
  } catch {
    return res.status(502).json({
      error: 'DB 연결에 실패했습니다.'
    });
  }
}
