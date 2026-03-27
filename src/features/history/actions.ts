"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CartHistoryEntry = {
  id: string;
  user_id: string;
  total: number;
  receipt_image_url: string | null;
  created_at: string;
  finalized_at: string | null;
  store_id: string | null;
  store_name: string | null;
  item_count: number;
  is_shared: boolean;
  owner_email: string | null;
};

export async function getCartHistory(): Promise<{
  carts: CartHistoryEntry[];
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Own finalized carts
  const { data: ownCarts, error } = await supabase
    .from("shopping_carts")
    .select(
      "id, user_id, total, receipt_image_url, created_at, finalized_at, store_id, stores ( name ), shopping_cart_items ( id )",
    )
    .eq("user_id", user.id)
    .not("finalized_at", "is", null)
    .order("finalized_at", { ascending: false });

  if (error) {
    return { error: error.message, carts: [] };
  }

  const ownCartsFormatted: CartHistoryEntry[] = (ownCarts ?? []).map((cart) => {
    const store = cart.stores as unknown as { name: string } | null;
    return {
      id: cart.id,
      user_id: cart.user_id,
      total: Number(cart.total),
      receipt_image_url: cart.receipt_image_url,
      created_at: cart.created_at,
      finalized_at: cart.finalized_at,
      store_id: cart.store_id,
      store_name: store?.name ?? null,
      item_count: Array.isArray(cart.shopping_cart_items)
        ? cart.shopping_cart_items.length
        : 0,
      is_shared: false,
      owner_email: null,
    };
  });

  // Shared finalized carts
  const { data: shares } = await supabase
    .from("cart_shares")
    .select("cart_id, owner_id")
    .eq("shared_with_user_id", user.id);

  const sharedCartsFormatted: CartHistoryEntry[] = [];

  if (shares && shares.length > 0) {
    const cartIds = shares.map((s) => s.cart_id);
    const ownerIds = [...new Set(shares.map((s) => s.owner_id))];

    const { data: sharedCarts } = await supabase
      .from("shopping_carts")
      .select(
        "id, user_id, total, receipt_image_url, created_at, finalized_at, store_id, stores ( name ), shopping_cart_items ( id )",
      )
      .in("id", cartIds)
      .not("finalized_at", "is", null);

    // Get owner emails from profiles
    const { data: ownerProfiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", ownerIds);

    const ownerEmailMap: Record<string, string> = {};
    for (const p of ownerProfiles ?? []) {
      ownerEmailMap[p.id] = p.email;
    }

    const shareOwnerMap: Record<string, string> = {};
    for (const s of shares) {
      shareOwnerMap[s.cart_id] = s.owner_id;
    }

    for (const cart of sharedCarts ?? []) {
      const ownerId = shareOwnerMap[cart.id];
      const store = cart.stores as unknown as { name: string } | null;
      sharedCartsFormatted.push({
        id: cart.id,
        user_id: cart.user_id,
        total: Number(cart.total),
        receipt_image_url: cart.receipt_image_url,
        created_at: cart.created_at,
        finalized_at: cart.finalized_at,
        store_id: cart.store_id,
        store_name: store?.name ?? null,
        item_count: Array.isArray(cart.shopping_cart_items)
          ? cart.shopping_cart_items.length
          : 0,
        is_shared: true,
        owner_email: ownerEmailMap[ownerId] ?? null,
      });
    }
  }

  // Merge and sort by finalized_at descending
  const allCarts = [...ownCartsFormatted, ...sharedCartsFormatted].sort(
    (a, b) =>
      new Date(b.finalized_at ?? b.created_at).getTime() -
      new Date(a.finalized_at ?? a.created_at).getTime(),
  );

  return { carts: allCarts };
}

export async function getCartDetail(cartId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: cart, error: cartError } = await supabase
    .from("shopping_carts")
    .select("id, user_id, total, receipt_image_url, created_at")
    .eq("id", cartId)
    .eq("user_id", user.id)
    .single();

  if (cartError || !cart) {
    return {
      error: cartError?.message || "Cart not found",
      cart: null,
      items: [],
    };
  }

  const { data: items, error: itemsError } = await supabase
    .from("shopping_cart_items")
    .select("id, cart_id, product_id, price, quantity, created_at, products ( name )")
    .eq("cart_id", cartId)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return { error: itemsError.message, cart, items: [] };
  }

  return { cart, items: items ?? [] };
}

export async function getProductPriceHistory(productId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: entries, error } = await supabase
    .from("product_entries")
    .select(
      "id, product_id, store_id, price, quantity, created_at, stores(name)",
    )
    .eq("product_id", productId)
    .order("created_at", { ascending: true });

  if (error) {
    return { error: error.message, entries: [] };
  }

  return { entries: entries ?? [] };
}

export async function getStoreComparison(productId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data, error } = await supabase
    .from("latest_product_prices")
    .select("store_name, price")
    .eq("product_id", productId);

  if (error) {
    return { error: error.message, comparisons: [] };
  }

  return { comparisons: data ?? [] };
}
