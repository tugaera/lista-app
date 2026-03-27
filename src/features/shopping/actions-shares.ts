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

  // Look up user by email in profiles
  const normalizedEmail = email.toLowerCase().trim();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  // Insert share
  const { error } = await supabase.from("cart_shares").insert({
    cart_id: cartId,
    owner_id: user.id,
    shared_with_email: normalizedEmail,
    shared_with_user_id: profile?.id ?? null,
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

export async function getSharedWithMeCarts(): Promise<SharedWithMeCart[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  // Get cart_shares where shared_with_user_id = current user
  const { data: shares, error } = await supabase
    .from("cart_shares")
    .select(
      "cart_id, owner_id",
    )
    .eq("shared_with_user_id", user.id);

  if (error || !shares || shares.length === 0) return [];

  const cartIds = shares.map((s) => s.cart_id);
  const ownerIds = [...new Set(shares.map((s) => s.owner_id))];

  // Get carts (only non-finalized)
  const { data: carts } = await supabase
    .from("shopping_carts")
    .select("id, total, finalized_at, store_id, stores(name)")
    .in("id", cartIds)
    .is("finalized_at", null);

  if (!carts || carts.length === 0) return [];

  // Get owner emails from profiles
  const { data: ownerProfiles } = await supabase
    .from("profiles")
    .select("id, email")
    .in("id", ownerIds);

  const ownerEmailMap: Record<string, string> = {};
  for (const p of ownerProfiles ?? []) {
    ownerEmailMap[p.id] = p.email;
  }

  // Build share map: cart_id -> owner_id
  const shareOwnerMap: Record<string, string> = {};
  for (const s of shares) {
    shareOwnerMap[s.cart_id] = s.owner_id;
  }

  return carts.map((cart) => {
    const ownerId = shareOwnerMap[cart.id];
    const store = cart.stores as unknown as { name: string } | null;
    return {
      cartId: cart.id,
      ownerEmail: ownerEmailMap[ownerId] ?? ownerId ?? "",
      total: cart.total,
      storeName: store?.name ?? null,
    };
  });
}
