"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CartItemDisplay = {
  id: string;
  productId: string | null;
  productName: string;
  productBarcode: string | null;
  price: number;
  quantity: number;
  subtotal: number;
  merged?: boolean;
};

export async function createCart(): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("shopping_carts")
    .insert({ user_id: user.id, total: 0 })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create cart: ${error.message}`);
  return data.id;
}

export async function addCartItem(
  cartId: string,
  data: {
    productName: string;
    price: number;
    quantity: number;
    storeId: string;
    barcode?: string;
  },
): Promise<CartItemDisplay> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  // Try to find existing product (read-only, no INSERT)
  let productId: string | null = null;

  if (data.barcode) {
    const { data: existingByBarcode } = await supabase
      .from("products")
      .select("id")
      .eq("barcode", data.barcode)
      .maybeSingle();

    if (existingByBarcode) {
      productId = existingByBarcode.id;
    }
  } else {
    const { data: existingByName } = await supabase
      .from("products")
      .select("id")
      .ilike("name", data.productName)
      .limit(1)
      .maybeSingle();

    if (existingByName) {
      productId = existingByName.id;
    }
  }

  // Deduplication: check existing cart items
  // 1. By barcode first
  // 2. Then by product_id
  // 3. Then by product_name (case-insensitive)
  const { data: existingItems } = await supabase
    .from("shopping_cart_items")
    .select("id, quantity, product_barcode, product_id, product_name")
    .eq("cart_id", cartId);

  let existingItemId: string | null = null;
  let existingQuantity = 0;

  if (existingItems && existingItems.length > 0) {
    let match = null;

    if (data.barcode) {
      match = existingItems.find(
        (item) => item.product_barcode === data.barcode,
      );
    }

    if (!match && productId) {
      match = existingItems.find(
        (item) => item.product_id === productId,
      );
    }

    if (!match) {
      match = existingItems.find(
        (item) =>
          item.product_name.toLowerCase() === data.productName.toLowerCase(),
      );
    }

    if (match) {
      existingItemId = match.id;
      existingQuantity = match.quantity;
    }
  }

  // Merge quantity if duplicate found
  if (existingItemId) {
    const newQuantity = existingQuantity + data.quantity;
    await supabase
      .from("shopping_cart_items")
      .update({
        quantity: newQuantity,
        price: data.price,
        product_name: data.productName,
        product_barcode: data.barcode ?? null,
        product_id: productId,
      })
      .eq("id", existingItemId);

    await recalculateCartTotal(cartId);

    return {
      id: existingItemId,
      productId,
      productName: data.productName,
      productBarcode: data.barcode ?? null,
      price: data.price,
      quantity: newQuantity,
      subtotal: data.price * newQuantity,
      merged: true,
    };
  }

  // Insert new cart item
  const { data: cartItem, error: cartItemError } = await supabase
    .from("shopping_cart_items")
    .insert({
      cart_id: cartId,
      product_id: productId,
      product_name: data.productName,
      product_barcode: data.barcode ?? null,
      price: data.price,
      quantity: data.quantity,
    })
    .select("id")
    .single();

  if (cartItemError)
    throw new Error(`Failed to add cart item: ${cartItemError.message}`);

  await recalculateCartTotal(cartId);

  return {
    id: cartItem.id,
    productId,
    productName: data.productName,
    productBarcode: data.barcode ?? null,
    price: data.price,
    quantity: data.quantity,
    subtotal: data.price * data.quantity,
    merged: false,
  };
}

export async function removeCartItem(
  cartId: string,
  itemId: string,
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("shopping_cart_items")
    .delete()
    .eq("id", itemId)
    .eq("cart_id", cartId);

  if (error) throw new Error(`Failed to remove cart item: ${error.message}`);

  await recalculateCartTotal(cartId);
}

export async function updateCartItemQuantity(
  cartId: string,
  itemId: string,
  quantity: number,
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("shopping_cart_items")
    .update({ quantity })
    .eq("id", itemId)
    .eq("cart_id", cartId);

  if (error)
    throw new Error(`Failed to update cart item: ${error.message}`);

  await recalculateCartTotal(cartId);
}

export async function getActiveCart(
  userId: string,
): Promise<{ id: string; total: number }> {
  const supabase = await createServerSupabaseClient();

  // Get most recent non-finalized cart
  const { data: existingCart } = await supabase
    .from("shopping_carts")
    .select("id, total")
    .eq("user_id", userId)
    .is("finalized_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingCart) return existingCart;

  // Create new one
  const { data: newCart, error } = await supabase
    .from("shopping_carts")
    .insert({ user_id: userId, total: 0 })
    .select("id, total")
    .single();

  if (error) throw new Error(`Failed to create cart: ${error.message}`);
  return newCart;
}

export async function updateCartStore(
  cartId: string,
  storeId: string | null,
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase
    .from("shopping_carts")
    .update({ store_id: storeId })
    .eq("id", cartId)
    .eq("user_id", user.id);
}

export async function finalizeCart(
  cartId: string,
): Promise<{ total: number }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  // Get cart with store_id
  const { data: cart } = await supabase
    .from("shopping_carts")
    .select("store_id")
    .eq("id", cartId)
    .eq("user_id", user.id)
    .single();

  // Fetch all cart items
  const { data: items } = await supabase
    .from("shopping_cart_items")
    .select("id, product_id, product_name, product_barcode, price, quantity")
    .eq("cart_id", cartId);

  // For items where product_id is null: find-or-create product
  for (const item of items ?? []) {
    let productId = item.product_id;

    if (!productId) {
      // Try find by barcode first
      if (item.product_barcode) {
        const { data: byBarcode } = await supabase
          .from("products")
          .select("id")
          .eq("barcode", item.product_barcode)
          .maybeSingle();

        if (byBarcode) productId = byBarcode.id;
      }

      // Try find by name
      if (!productId) {
        const { data: byName } = await supabase
          .from("products")
          .select("id")
          .ilike("name", item.product_name)
          .limit(1)
          .maybeSingle();

        if (byName) productId = byName.id;
      }

      // Create product if still not found
      if (!productId) {
        const { data: newProduct } = await supabase
          .from("products")
          .insert({
            name: item.product_name,
            barcode: item.product_barcode ?? undefined,
          })
          .select("id")
          .single();

        if (newProduct) productId = newProduct.id;
      }

      // Update cart item with product_id
      if (productId) {
        await supabase
          .from("shopping_cart_items")
          .update({ product_id: productId })
          .eq("id", item.id);
      }
    }

    // Create product_entry for price history (using cart's store_id)
    if (cart?.store_id && productId) {
      await supabase.from("product_entries").insert({
        product_id: productId,
        store_id: cart.store_id,
        price: item.price,
        quantity: item.quantity,
      });
    }
  }

  // Recalculate total and mark finalized
  await recalculateCartTotal(cartId);

  const { data, error } = await supabase
    .from("shopping_carts")
    .update({ finalized_at: new Date().toISOString() })
    .eq("id", cartId)
    .eq("user_id", user.id)
    .select("total")
    .single();

  if (error) throw new Error(`Failed to finalize cart: ${error.message}`);
  return { total: data.total };
}

export async function getCartItems(
  cartId: string,
): Promise<CartItemDisplay[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("shopping_cart_items")
    .select("id, product_id, product_name, product_barcode, price, quantity")
    .eq("cart_id", cartId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch cart items: ${error.message}`);

  return (data ?? []).map((item) => ({
    id: item.id,
    productId: item.product_id,
    productName: item.product_name,
    productBarcode: item.product_barcode,
    price: item.price,
    quantity: item.quantity,
    subtotal: item.price * item.quantity,
  }));
}

export async function recalculateCartTotal(cartId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { data: items } = await supabase
    .from("shopping_cart_items")
    .select("price, quantity")
    .eq("cart_id", cartId);

  const total = (items ?? []).reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  await supabase.from("shopping_carts").update({ total }).eq("id", cartId);
}
