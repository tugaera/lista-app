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

export async function updateLanguage(language: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({ language })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return {};
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not authenticated" };

  // Verify current password by attempting to sign in
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (signInError) return { error: "Current password is incorrect" };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };
  return {};
}

export type UserWithInviter = Profile & { inviter_email?: string };

export async function getUsers(): Promise<{ users: UserWithInviter[]; error?: string }> {
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

  const profiles = data ?? [];

  // Build a map of id -> email for resolving invited_by
  const emailMap = new Map(profiles.map((p) => [p.id, p.email]));

  const usersWithInviter: UserWithInviter[] = profiles.map((p) => ({
    ...p,
    inviter_email: p.invited_by ? emailMap.get(p.invited_by) ?? undefined : undefined,
  }));

  return { users: usersWithInviter };
}

export async function createInvite(
  _prevState: { error: string; invite?: Invite; emailSent?: boolean },
  formData: FormData
): Promise<{ error: string; invite?: Invite; emailSent?: boolean }> {
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
  const assignedRole = (formData.get("assigned_role") as string) || "user";
  const email = (formData.get("email") as string)?.trim().toLowerCase() || "";
  const sendEmail = formData.get("action") === "send";

  // Moderators can only invite users, not other moderators or admins
  if (profile.role === "moderator" && assignedRole !== "user") {
    return { error: "Moderators can only invite regular users" };
  }

  // Validate role
  if (!["admin", "moderator", "user"].includes(assignedRole)) {
    return { error: "Invalid role" };
  }

  // If sending, email is required
  if (sendEmail && !email) {
    return { error: "Email is required to send an invite" };
  }

  // If email provided, check it's not already registered
  if (email) {
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return { error: "A user with that email is already registered" };
    }
  }

  // Generate a short readable code
  const code = crypto.randomUUID().slice(0, 8).toUpperCase();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const { data, error } = await supabase
    .from("invites")
    .insert({
      code,
      created_by: user.id,
      assigned_role: assignedRole as "admin" | "moderator" | "user",
      expires_at: expiresAt.toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    return { error: error.message };
  }

  // Send invite email if requested
  let emailSent = false;
  if (sendEmail && email) {
    try {
      const { createAdminSupabaseClient } = await import("@/lib/supabase/admin");
      const admin = createAdminSupabaseClient();
      if (!admin) {
        return { error: "", invite: data, emailSent: false };
      }
      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(".supabase.co", "") ?? "";
      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${origin}/auth/signup?code=${code}`,
      });
      if (inviteError) {
        // Invite code was created but email failed — still return the invite
        return { error: `Invite created but email failed: ${inviteError.message}`, invite: data, emailSent: false };
      }
      emailSent = true;
    } catch {
      return { error: "", invite: data, emailSent: false };
    }
  }

  return { error: "", invite: data, emailSent };
}

export async function deleteInvite(inviteId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Only delete unused invites that belong to the caller
  const { error } = await supabase
    .from("invites")
    .delete()
    .eq("id", inviteId)
    .eq("created_by", user.id)
    .is("used_by", null);

  if (error) {
    return { error: error.message };
  }

  return {};
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
