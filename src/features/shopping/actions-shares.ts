"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CartShareInfo = {
  id: string;
  sharedWithEmail: string;
  sharedWithUserId: string | null;
  createdAt: string;
};

export type SharedWithMeCart = {
  cartId: string;
  ownerEmail: string;
  total: number;
  storeName: string | null;
};

export async function shareCart(
  cartId: string,
  email: string,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Verify ownership
  const { data: cart } = await supabase
    .from("shopping_carts")
    .select("id, user_id")
    .eq("id", cartId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!cart) return { error: "Cart not found or not owned by you" };

  // Look up user by email (uses security definer function to bypass RLS)
  const normalizedEmail = email.toLowerCase().trim();
  const { data: profileId } = await supabase.rpc("get_profile_id_by_email", {
    lookup_email: normalizedEmail,
  });

  if (!profileId) return { error: "No account found with that email. The user must register first." };

  // Insert share
  const { error } = await supabase.from("cart_shares").insert({
    cart_id: cartId,
    owner_id: user.id,
    shared_with_email: normalizedEmail,
    shared_with_user_id: profileId,
  });

  if (error) {
    if (error.code === "23505") return { error: "Already shared with this user" };
    return { error: error.message };
  }

  return {};
}

export async function getCartShares(
  cartId: string,
): Promise<CartShareInfo[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("cart_shares")
    .select("id, shared_with_email, shared_with_user_id, created_at")
    .eq("cart_id", cartId)
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

export async function revokeCartShare(shareId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("cart_shares")
    .delete()
    .eq("id", shareId)
    .eq("owner_id", user.id);

  if (error) return { error: error.message };
  return {};
}

export async function leaveSharedCart(cartId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Use security definer RPC — RLS only allows cart owner to delete cart_shares
  const { error } = await supabase.rpc("leave_shared_cart", { p_cart_id: cartId });

  if (error) return { error: error.message };
  return {};
}

export async function joinCartByUrl(
  cartId: string,
): Promise<{ ownerEmail?: string; error?: string }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("join_cart_by_url", {
    p_cart_id: cartId,
  });

  if (error) return { error: error.message };

  const result = data as { success?: boolean; ownerEmail?: string; error?: string };
  if (result.error) {
    if (result.error === "own_cart") return { error: "own_cart" };
    return { error: result.error };
  }

  return { ownerEmail: result.ownerEmail };
}

export async function getSharedWithMeCarts(): Promise<SharedWithMeCart[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  // Use security definer RPC — direct query on shopping_carts is blocked by RLS for shared users
  const { data: rpcResult, error: rpcError } = await supabase.rpc("get_shared_carts_for_user");

  if (rpcError || !rpcResult) {
    // Fallback: direct query (works only when RLS allows it, e.g. if function not deployed yet)
    const { data: shares, error } = await supabase
      .from("cart_shares")
      .select("cart_id, owner_id")
      .eq("shared_with_user_id", user.id);
    if (error || !shares || shares.length === 0) return [];

    const ownerIds = [...new Set(shares.map((s) => s.owner_id))];
    const ownerEmailMap: Record<string, string> = {};
    await Promise.all(
      ownerIds.map(async (ownerId) => {
        const { data: email } = await supabase.rpc("get_profile_email_by_id", { user_id: ownerId });
        if (email) ownerEmailMap[ownerId] = email;
      }),
    );
    return shares.map((s) => ({
      cartId: s.cart_id,
      ownerEmail: ownerEmailMap[s.owner_id] ?? "",
      total: 0,
      storeName: null,
    }));
  }

  const carts = (typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult) as Array<{
    cart_id: string;
    owner_id: string;
    total: number;
    store_name: string | null;
  }>;

  if (!carts || carts.length === 0) return [];

  // Get owner emails
  const ownerIds = [...new Set(carts.map((c) => c.owner_id))];
  const ownerEmailMap: Record<string, string> = {};
  await Promise.all(
    ownerIds.map(async (ownerId) => {
      const { data: email } = await supabase.rpc("get_profile_email_by_id", { user_id: ownerId });
      if (email) ownerEmailMap[ownerId] = email;
    }),
  );

  return carts.map((c) => ({
    cartId: c.cart_id,
    ownerEmail: ownerEmailMap[c.owner_id] ?? "",
    total: c.total,
    storeName: c.store_name ?? null,
  }));
}
