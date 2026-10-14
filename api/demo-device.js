import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { createDemoHandler } from '../src/demo-approval.mjs';
import { createDemoStore } from '../src/demo-approval-store.mjs';
import config from '../aleph.config.json' with { type: 'json' };

let verifier, store;
export default createDemoHandler({
  verifyLogin: async authorization => {
    verifier ??= createLoginVerifier({ config, supabaseSecretKey: process.env.SUPABASE_SECRET_KEY });
    return verifier(authorization);
  },
  getStore: async () => {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) throw new Error('demo_configuration');
    store ??= createDemoStore(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }));
    return store;
  },
});
