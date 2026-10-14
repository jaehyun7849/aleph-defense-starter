import {createClient} from '@supabase/supabase-js';
import {createLoginVerifier} from '../src/verify-login.mjs';
import {createNoteRestoreHandler} from '../src/note-restore-handler.mjs';
import config from '../aleph.config.json' with {type:'json'};
let verifier;
export default createNoteRestoreHandler({createClient,verifyLogin:async authorization=>{
  verifier??=createLoginVerifier({config,supabaseSecretKey:process.env.SUPABASE_SECRET_KEY});
  return verifier(authorization);
}});
