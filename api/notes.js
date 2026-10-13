import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { createNotesHandler } from '../src/notes-handler.mjs';
import config from '../aleph.config.json' with { type: 'json' };

let verifyLogin;
export default createNotesHandler({ createClient,
  verifyLogin: async authorization => {
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: process.env.SUPABASE_SECRET_KEY });
    return verifyLogin(authorization);
  },
});
