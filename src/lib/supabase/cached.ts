import { cache } from "react";
import { createServerSupabaseClient } from "./server";
import type { Profile } from "@/types/database";

/**
 * Cached getUser() — deduplicates the Supabase Auth API call within a single
 * server request. Layout + page components both call this but the network
 * round-trip only happens once.
 */
export const getCachedUser = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Cached profile fetch — runs at most once per request.
 * Does NOT handle profile auto-creation (that stays in layout.tsx as a rare
 * fallback). This is the fast path for pages that just need the profile.
 */
export const getCachedProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCachedUser();
  if (!user) return null;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, role, language, invited_by, created_at")
    .eq("id", user.id)
    .single();
  return data;
});
