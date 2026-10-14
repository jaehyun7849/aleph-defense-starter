import { createLoginVerifier } from '../src/verify-login.mjs';
import { createDeviceApprovalHandler } from '../src/device-approval-handler.mjs';
import config from '../aleph.config.json' with { type: 'json' };

let verifier;
export default createDeviceApprovalHandler({ verifyLogin: async authorization => {
  verifier ??= createLoginVerifier({ config, supabaseSecretKey: process.env.SUPABASE_SECRET_KEY });
  return verifier(authorization);
} });
