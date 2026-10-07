import { createClient } from '@supabase/supabase-js';
import { createAuthHandler } from '../src/auth-handler.mjs';

export default createAuthHandler(createClient);
