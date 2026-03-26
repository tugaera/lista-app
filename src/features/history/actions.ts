"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getCartHistory() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: carts, error } = await supabase
    .from("shopping_carts")
    .select("id, user_id, total, receipt_image_url, created_at, shopping_cart_items(count)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return { error: error.message, carts: [] };
  }

  const cartsWithCount = (carts ?? []).map((cart) => ({
    ...cart,
    item_count:
      (cart.shopping_cart_items as unknown as { count: number }[])?.[0]
        ?.count ?? 0,
  }));

  return { carts: cartsWithCount };
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
    .select(
      "id, cart_id, product_entry_id, quantity, created_at, product_entries(id, price, quantity, product_id, store_id, products(name), stores(name))"
    )
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
    .select("id, product_id, store_id, price, quantity, created_at, stores(name)")
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
