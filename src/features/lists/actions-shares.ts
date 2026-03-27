"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ListShareInfo = {
  id: string;
  sharedWithEmail: string;
  sharedWithUserId: string | null;
  createdAt: string;
};

export type SharedWithMeList = {
  listId: string;
  listName: string;
  ownerEmail: string;
};

export async function shareList(
  listId: string,
  email: string,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Verify ownership
  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id, user_id")
    .eq("id", listId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!list) return { error: "List not found or not owned by you" };

  const normalizedEmail = email.toLowerCase().trim();

  if (normalizedEmail === (await supabase.from("profiles").select("email").eq("id", user.id).single()).data?.email?.toLowerCase()) {
    return { error: "Cannot share with yourself" };
  }

  // Look up user by email
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (!profile) return { error: "No account found with that email. The user must register first." };

  const { error } = await supabase.from("list_shares").insert({
    list_id: listId,
    owner_id: user.id,
    shared_with_email: normalizedEmail,
    shared_with_user_id: profile.id,
  });

  if (error) {
    if (error.code === "23505") return { error: "Already shared with this user" };
    return { error: error.message };
  }

  return {};
}

export async function getListShares(listId: string): Promise<ListShareInfo[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("list_shares")
    .select("id, shared_with_email, shared_with_user_id, created_at")
    .eq("list_id", listId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return [];

  return (data ?? []).map((row) => ({
    id: row.id,
    sharedWithEmail: row.shared_with_email,
    sharedWithUserId: row.shared_with_user_id,
    createdAt: row.created_at,
  }));
}

export async function revokeListShare(shareId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("list_shares")
    .delete()
    .eq("id", shareId)
    .eq("owner_id", user.id);

  if (error) return { error: error.message };
  return {};
}

export async function getSharedWithMeLists(): Promise<SharedWithMeList[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: shares, error } = await supabase
    .from("list_shares")
    .select("list_id, owner_id")
    .eq("shared_with_user_id", user.id);

  if (error || !shares || shares.length === 0) return [];

  const listIds = shares.map((s) => s.list_id);
  const ownerIds = [...new Set(shares.map((s) => s.owner_id))];

  const [listsResult, profilesResult] = await Promise.all([
    supabase.from("shopping_lists").select("id, name").in("id", listIds),
    supabase.from("profiles").select("id, email").in("id", ownerIds),
  ]);

  const listMap: Record<string, string> = {};
  for (const l of listsResult.data ?? []) listMap[l.id] = l.name;

  const ownerEmailMap: Record<string, string> = {};
  for (const p of profilesResult.data ?? []) ownerEmailMap[p.id] = p.email;

  const shareOwnerMap: Record<string, string> = {};
  for (const s of shares) shareOwnerMap[s.list_id] = s.owner_id;

  return listIds
    .filter((id) => listMap[id])
    .map((listId) => ({
      listId,
      listName: listMap[listId],
      ownerEmail: ownerEmailMap[shareOwnerMap[listId]] ?? "",
    }));
}

export async function joinListByUrl(
  listId: string,
): Promise<{ ownerEmail?: string; error?: string }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("join_list_by_url", {
    p_list_id: listId,
  });

  if (error) return { error: error.message };

  const result = data as { success?: boolean; ownerEmail?: string; error?: string };
  if (result.error) {
    if (result.error === "own_list") return { error: "own_list" };
    return { error: result.error };
  }

  return { ownerEmail: result.ownerEmail };
}
