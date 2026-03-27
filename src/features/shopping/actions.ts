"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CartItemDisplay = {
  id: string;
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  storeName: string;
  subtotal: number;
  productEntryId?: string;
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

  // Check if the same product is already in this cart — if so, merge quantities
  const { data: existingCartItems } = await supabase
    .from("shopping_cart_items")
    .select("id, quantity")
    .eq("cart_id", cartId)
    .eq("product_id", productId);

  const existingItem = existingCartItems?.[0];

  if (existingItem) {
    const newQuantity = existingItem.quantity + data.quantity;
    await supabase
      .from("shopping_cart_items")
      .update({ quantity: newQuantity, price: data.price })
      .eq("id", existingItem.id);

    await recalculateCartTotal(cartId);

    return {
      id: existingItem.id,
      productId,
      productName: data.productName,
      price: data.price,
      quantity: newQuantity,
      storeName: "",
      subtotal: data.price * newQuantity,
      merged: true,
    };
  }

  // Insert cart item with product_id + price directly (no product_entries yet)
  const { data: cartItem, error: cartItemError } = await supabase
    .from("shopping_cart_items")
    .insert({
      cart_id: cartId,
      product_id: productId,
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
    price: data.price,
    quantity: data.quantity,
    storeName: "",
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

  // Get cart with store_id and all items
  const { data: cart } = await supabase
    .from("shopping_carts")
    .select("store_id")
    .eq("id", cartId)
    .eq("user_id", user.id)
    .single();

  // Create product_entries for each item (price history recorded at checkout)
  if (cart?.store_id) {
    const { data: items } = await supabase
      .from("shopping_cart_items")
      .select("product_id, price, quantity")
      .eq("cart_id", cartId);

    if (items && items.length > 0) {
      await supabase.from("product_entries").insert(
        items.map((item) => ({
          product_id: item.product_id,
          store_id: cart.store_id!,
          price: item.price,
          quantity: item.quantity,
        })),
      );
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
    .select("id, product_id, price, quantity, products ( name )")
    .eq("cart_id", cartId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch cart items: ${error.message}`);

  return (data ?? []).map((item) => {
    const product = item.products as unknown as { name: string };
    return {
      id: item.id,
      productId: item.product_id,
      productName: product.name,
      price: item.price,
      quantity: item.quantity,
      storeName: "",
      subtotal: item.price * item.quantity,
    };
  });
}

async function recalculateCartTotal(cartId: string): Promise<void> {
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
