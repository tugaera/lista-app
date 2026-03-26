"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CartItemDisplay = {
  id: string;
  productName: string;
  price: number;
  quantity: number;
  storeName: string;
  subtotal: number;
  productEntryId: string;
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

  // Find or create product (by barcode first, then by name)
  let productId: string;

  if (data.barcode) {
    const { data: existingByBarcode } = await supabase
      .from("products")
      .select("id")
      .eq("barcode", data.barcode)
      .single();

    if (existingByBarcode) {
      productId = existingByBarcode.id;
    } else {
      const { data: newProduct, error: productError } = await supabase
        .from("products")
        .insert({ name: data.productName, barcode: data.barcode })
        .select("id")
        .single();

      if (productError)
        throw new Error(`Failed to create product: ${productError.message}`);
      productId = newProduct.id;
    }
  } else {
    const { data: existingByName } = await supabase
      .from("products")
      .select("id")
      .ilike("name", data.productName)
      .limit(1)
      .single();

    if (existingByName) {
      productId = existingByName.id;
    } else {
      const { data: newProduct, error: productError } = await supabase
        .from("products")
        .insert({ name: data.productName })
        .select("id")
        .single();

      if (productError)
        throw new Error(`Failed to create product: ${productError.message}`);
      productId = newProduct.id;
    }
  }

  // If product was added via barcode, check if it already exists in this cart
  if (data.barcode) {
    // Find existing cart item for same product + store
    const { data: existingCartItems } = await supabase
      .from("shopping_cart_items")
      .select(`
        id,
        quantity,
        product_entries!inner ( product_id, store_id )
      `)
      .eq("cart_id", cartId);

    const existingItem = (existingCartItems ?? []).find((ci) => {
      const entry = ci.product_entries as unknown as { product_id: string; store_id: string };
      return entry.product_id === productId && entry.store_id === data.storeId;
    });

    if (existingItem) {
      // Merge quantities
      const newQuantity = existingItem.quantity + data.quantity;
      await supabase
        .from("shopping_cart_items")
        .update({ quantity: newQuantity })
        .eq("id", existingItem.id);

      // Still insert a new price entry for history
      await supabase
        .from("product_entries")
        .insert({
          product_id: productId,
          store_id: data.storeId,
          price: data.price,
          quantity: data.quantity,
        });

      await recalculateCartTotal(cartId);

      const { data: store } = await supabase
        .from("stores")
        .select("name")
        .eq("id", data.storeId)
        .single();

      return {
        id: existingItem.id,
        productName: data.productName,
        price: data.price,
        quantity: newQuantity,
        storeName: store?.name ?? "",
        subtotal: data.price * newQuantity,
        productEntryId: existingItem.id,
        merged: true,
      };
    }
  }

  // ALWAYS insert new product_entries row (never update - price history!)
  const { data: productEntry, error: entryError } = await supabase
    .from("product_entries")
    .insert({
      product_id: productId,
      store_id: data.storeId,
      price: data.price,
      quantity: data.quantity,
    })
    .select("id")
    .single();

  if (entryError)
    throw new Error(`Failed to create product entry: ${entryError.message}`);

  // Insert shopping_cart_items row
  const { data: cartItem, error: cartItemError } = await supabase
    .from("shopping_cart_items")
    .insert({
      cart_id: cartId,
      product_entry_id: productEntry.id,
      quantity: data.quantity,
    })
    .select("id")
    .single();

  if (cartItemError)
    throw new Error(`Failed to add cart item: ${cartItemError.message}`);

  // Update cart total
  await recalculateCartTotal(cartId);

  // Get store name for display
  const { data: store } = await supabase
    .from("stores")
    .select("name")
    .eq("id", data.storeId)
    .single();

  return {
    id: cartItem.id,
    productName: data.productName,
    price: data.price,
    quantity: data.quantity,
    storeName: store?.name ?? "",
    subtotal: data.price * data.quantity,
    productEntryId: productEntry.id,
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
    .single();

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

  // Recalculate total one final time
  await recalculateCartTotal(cartId);

  // Mark as finalized (store_id already set on the cart)
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
    .select(
      `
      id,
      quantity,
      product_entry_id,
      product_entries (
        id,
        price,
        quantity,
        products ( name ),
        stores ( name )
      )
    `,
    )
    .eq("cart_id", cartId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch cart items: ${error.message}`);

  return (data ?? []).map((item) => {
    const entry = item.product_entries as unknown as {
      id: string;
      price: number;
      quantity: number;
      products: { name: string };
      stores: { name: string };
    };

    return {
      id: item.id,
      productName: entry.products.name,
      price: entry.price,
      quantity: item.quantity,
      storeName: entry.stores.name,
      subtotal: entry.price * item.quantity,
      productEntryId: entry.id,
    };
  });
}

async function recalculateCartTotal(cartId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();

  const { data: items } = await supabase
    .from("shopping_cart_items")
    .select(
      `
      quantity,
      product_entries ( price )
    `,
    )
    .eq("cart_id", cartId);

  const total = (items ?? []).reduce((sum, item) => {
    const entry = item.product_entries as unknown as { price: number };
    return sum + entry.price * item.quantity;
  }, 0);

  await supabase
    .from("shopping_carts")
    .update({ total })
    .eq("id", cartId);
}
