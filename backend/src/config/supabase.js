import { createClient } from '@supabase/supabase-js';

export function createSupabaseClients(config) {
  const clientOptions = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };

  // Service-role client strictly for backend authorization & vault reads
  const supabaseAdmin = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_SERVICE_ROLE_KEY,
    clientOptions
  );

  // Anon client strictly for credential verification via Supabase Auth
  const supabaseAuth = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_ANON_KEY,
    clientOptions
  );

  return { supabaseAdmin, supabaseAuth };
}
