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

  // Shared finalized carts — use security definer RPC to bypass owner-only RLS
  const { data: sharedRpc } = await supabase.rpc("get_shared_finalized_carts");
  const sharedRows = (sharedRpc ?? []) as Array<{
    id: string;
    user_id: string;
    total: number;
    receipt_image_url: string | null;
    created_at: string;
    finalized_at: string | null;
    store_id: string | null;
    store_name: string | null;
    owner_email: string | null;
    item_count: number;
  }>;

  const sharedCartsFormatted: CartHistoryEntry[] = sharedRows.map((cart) => ({
    id: cart.id,
    user_id: cart.user_id,
    total: Number(cart.total),
    receipt_image_url: cart.receipt_image_url,
    created_at: cart.created_at,
    finalized_at: cart.finalized_at,
    store_id: cart.store_id,
    store_name: cart.store_name,
    item_count: Number(cart.item_count),
    is_shared: true,
    owner_email: cart.owner_email,
  }));

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

  // Try own cart first (direct query works for owner via RLS)
  let { data: cart } = await supabase
    .from("shopping_carts")
    .select("id, user_id, total, receipt_image_url, created_at")
    .eq("id", cartId)
    .eq("user_id", user.id)
    .single();

  // If not own cart, use security definer RPC to check shared access
  if (!cart) {
    const { data: rpcCart } = await supabase.rpc("get_cart_by_id", { p_cart_id: cartId });
    if (rpcCart) {
      const c = rpcCart as { id: string; user_id: string; total: number; receipt_image_url: string | null; created_at: string };
      cart = { id: c.id, user_id: c.user_id, total: c.total, receipt_image_url: c.receipt_image_url, created_at: c.created_at };
    }
  }

  if (!cart) {
    return { error: "Cart not found", cart: null, items: [] };
  }

  // Try direct query for items (works for owner)
  let { data: items } = await supabase
    .from("shopping_cart_items")
    .select("id, cart_id, product_id, price, original_price, quantity, created_at, products ( name )")
    .eq("cart_id", cartId)
    .order("created_at", { ascending: true });

  // If empty (could be RLS blocking shared user), use RPC
  if (!items || items.length === 0) {
    const { data: rpcItems } = await supabase.rpc("get_cart_items", { p_cart_id: cartId });
    const rpcRows = (rpcItems ?? []) as Array<{
      id: string;
      product_id: string | null;
      product_name: string;
      product_barcode: string | null;
      price: number;
      original_price: number | null;
      quantity: number;
      created_at: string;
    }>;
    items = rpcRows.map((r) => ({
      id: r.id,
      cart_id: cartId,
      product_id: r.product_id,
      price: r.price,
      original_price: r.original_price,
      quantity: r.quantity,
      created_at: r.created_at,
      products: r.product_name ? { name: r.product_name } : null,
    })) as typeof items;
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
