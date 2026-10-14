import { createClient } from '@supabase/supabase-js';
import { createDemoStore } from './demo-approval-store.mjs';
import { createHash } from 'node:crypto';

let store;
export async function getDemoStore() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('demo_configuration');
  store ??= createDemoStore(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
  return store;
}
export function createDemoVerifier({ getStore = getDemoStore, env = process.env } = {}) {
  return async (req, actor) => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!(env.DEMO_APPROVAL_ADMIN_IDS ?? '').split(',').some(id => uuid.test(id.trim()))) return false;
    const token = req.headers['x-demo-session'];
    if (actor?.kind !== 'student' || !uuid.test(actor.userId ?? '')
        || typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
    const row = await (await getStore()).find(actor.userId.toLowerCase(), createHash('sha256').update(token).digest('hex'));
    return row?.state === 'approved';
  };
}
export const verifyDemoDataAccess = createDemoVerifier();
