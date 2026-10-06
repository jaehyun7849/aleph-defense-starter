import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET 요청만 가능합니다.' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return res.status(500).json({
      error: '서버의 Supabase 환경변수 설정이 필요합니다.'
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
        error: 'DB 조회에 실패했습니다. 테이블과 서버 설정을 확인하세요.'
      });
    }

    return res.status(200).json({ notes: data });
  } catch {
    return res.status(502).json({
      error: 'DB 연결에 실패했습니다. 서버 설정을 확인하세요.'
    });
  }
}
