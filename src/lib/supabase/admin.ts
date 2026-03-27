import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Admin Supabase client using the service role key.
 * Only use in server actions — never expose to the client.
 */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
