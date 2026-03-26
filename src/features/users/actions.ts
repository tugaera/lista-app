"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Profile, Invite } from "@/types/database";

export async function getCurrentUserProfile(): Promise<Profile | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data;
}

export async function getUsers(): Promise<{ users: Profile[]; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // RLS handles filtering: admin sees all, moderator sees invitees, user sees self
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return { users: [], error: error.message };
  }

  return { users: data ?? [] };
}

export async function createInvite(
  _prevState: { error: string; invite?: Invite },
  formData: FormData
): Promise<{ error: string; invite?: Invite }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Verify caller is admin or moderator
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "moderator")) {
    return { error: "Insufficient permissions" };
  }

  const expiresInDays = Number(formData.get("expires_in_days")) || 7;

  // Generate a short readable code
  const code = crypto.randomUUID().slice(0, 8).toUpperCase();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const { data, error } = await supabase
    .from("invites")
    .insert({
      code,
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    return { error: error.message };
  }

  return { error: "", invite: data };
}

export async function getMyInvites(): Promise<{ invites: Invite[]; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return { invites: [], error: error.message };
  }

  return { invites: data ?? [] };
}

export async function updateUserRole(
  _prevState: { error: string; success: boolean },
  formData: FormData
): Promise<{ error: string; success: boolean }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated", success: false };
  }

  // Verify caller is admin
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!callerProfile || callerProfile.role !== "admin") {
    return { error: "Only admins can change roles", success: false };
  }

  const userId = formData.get("user_id") as string;
  const newRole = formData.get("role") as "admin" | "moderator" | "user";

  if (!userId || !newRole) {
    return { error: "Missing user_id or role", success: false };
  }

  if (!["admin", "moderator", "user"].includes(newRole)) {
    return { error: "Invalid role", success: false };
  }

  // Prevent admin from demoting themselves
  if (userId === user.id) {
    return { error: "Cannot change your own role", success: false };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole })
    .eq("id", userId);

  if (error) {
    return { error: error.message, success: false };
  }

  return { error: "", success: true };
}
