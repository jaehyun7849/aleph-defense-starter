import {createClient} from '@supabase/supabase-js';
import {createLoginVerifier} from '../src/verify-login.mjs';
import {createNoteRestoreHandler} from '../src/note-restore-handler.mjs';
import {protectDeviceRequests} from '../src/protected-device-handler.mjs';
import config from '../aleph.config.json' with {type:'json'};
let verifier;
const verifyLogin=async authorization=>{
  verifier??=createLoginVerifier({config,supabaseSecretKey:process.env.SUPABASE_SECRET_KEY});
  return verifier(authorization);
};
export default protectDeviceRequests({config,verifyLogin,
  handler:createNoteRestoreHandler({createClient,verifyLogin})});
