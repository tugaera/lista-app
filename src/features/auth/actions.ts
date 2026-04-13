"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signUp(
  _prevState: { error: string },
  formData: FormData
) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const inviteCode = formData.get("invite_code") as string;

  if (!inviteCode?.trim()) {
    return { error: "Invite code is required" };
  }

  const supabase = await createServerSupabaseClient();

  // Validate invite code before creating the user
  const { data: isValid, error: validateError } = await supabase.rpc(
    "validate_invite_code",
    { invite_code: inviteCode.trim() }
  );

  if (validateError) {
    return { error: "Could not validate invite code" };
  }

  if (!isValid) {
    return { error: "Invalid or expired invite code" };
  }

  // Derive app origin from request headers so the confirmation email
  // always points back to this app regardless of environment
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const proto = headersList.get("x-forwarded-proto") ?? "https";
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`;

  // Create the user — emailRedirectTo sends the confirmation link to our callback
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (signUpError) {
    return { error: signUpError.message };
  }

  if (!authData.user) {
    return { error: "Signup failed" };
  }

  // Consume the invite and link to the user's profile
  const { data: consumed, error: consumeError } = await supabase.rpc(
    "consume_invite",
    { invite_code: inviteCode.trim(), user_id: authData.user.id }
  );

  if (consumeError || !consumed) {
    // Invite was used by someone else between validation and consumption
    return { error: "Invite code is no longer available. Please request a new one." };
  }

  redirect("/shopping");
}

export async function signIn(
  _prevState: { error: string },
  formData: FormData
) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/shopping");
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
