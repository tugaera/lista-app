"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createList(formData: FormData) {
  const name = formData.get("name") as string;
  if (!name?.trim()) {
    return { error: "List name is required" };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data, error } = await supabase
    .from("shopping_lists")
    .insert({ name: name.trim(), user_id: user.id })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }

  return { list: data };
}

export async function deleteList(listId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  await supabase
    .from("shopping_list_items")
    .delete()
    .eq("list_id", listId);

  const { error } = await supabase
    .from("shopping_lists")
    .delete()
    .eq("id", listId)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function addListItem(
  listId: string,
  productName: string,
  quantity: number
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Find existing product by name or create new one
  let productId: string;

  const { data: existing } = await supabase
    .from("products")
    .select("id")
    .ilike("name", productName.trim())
    .limit(1)
    .single();

  if (existing) {
    productId = existing.id;
  } else {
    const { data: newProduct, error: createError } = await supabase
      .from("products")
      .insert({ name: productName.trim() })
      .select("id")
      .single();

    if (createError || !newProduct) {
      return { error: createError?.message || "Failed to create product" };
    }
    productId = newProduct.id;
  }

  // Check if product already in this list — merge quantity
  const { data: existingItem } = await supabase
    .from("shopping_list_items")
    .select("id, planned_quantity")
    .eq("list_id", listId)
    .eq("product_id", productId)
    .single();

  if (existingItem) {
    const newQty = existingItem.planned_quantity + quantity;
    const { error: updateError } = await supabase
      .from("shopping_list_items")
      .update({ planned_quantity: newQty })
      .eq("id", existingItem.id);

    if (updateError) {
      return { error: updateError.message };
    }

    return { item: { id: existingItem.id }, merged: true };
  }

  const { data, error } = await supabase
    .from("shopping_list_items")
    .insert({
      list_id: listId,
      product_id: productId,
      planned_quantity: quantity,
    })
    .select("id, planned_quantity, product_id")
    .single();

  if (error) {
    return { error: error.message };
  }

  return { item: data, productName: productName.trim() };
}

export async function removeListItem(itemId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("id", itemId);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function updateListItemQuantity(
  itemId: string,
  quantity: number
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { error } = await supabase
    .from("shopping_list_items")
    .update({ planned_quantity: quantity })
    .eq("id", itemId);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function convertListToCart(listId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Get list items with product info
  const { data: listItems, error: itemsError } = await supabase
    .from("shopping_list_items")
    .select("product_id, planned_quantity")
    .eq("list_id", listId);

  if (itemsError || !listItems?.length) {
    return { error: itemsError?.message || "No items in list" };
  }

  // For each product, find the latest product_entry
  const productIds = listItems.map((item) => item.product_id);
  const { data: latestEntries, error: entriesError } = await supabase
    .from("latest_product_prices")
    .select("id, product_id, store_id, price, quantity, created_at, product_name, barcode, store_name")
    .in("product_id", productIds);

  if (entriesError) {
    return { error: entriesError.message };
  }

  // Create cart
  const { data: cart, error: cartError } = await supabase
    .from("shopping_carts")
    .insert({ user_id: user.id, total: 0 })
    .select("id")
    .single();

  if (cartError || !cart) {
    return { error: cartError?.message || "Failed to create cart" };
  }

  // Create cart items using product_id + last known price directly
  const cartItems = listItems
    .map((listItem) => {
      const entry = latestEntries?.find(
        (e) => e.product_id === listItem.product_id
      );
      if (!entry) return null;
      return {
        cart_id: cart.id,
        product_id: listItem.product_id,
        product_name: entry.product_name,
        product_barcode: entry.barcode ?? null,
        price: entry.price,
        quantity: listItem.planned_quantity,
      };
    })
    .filter(Boolean) as {
    cart_id: string;
    product_id: string;
    product_name: string;
    product_barcode: string | null;
    price: number;
    quantity: number;
  }[];

  if (cartItems.length > 0) {
    const { error: cartItemsError } = await supabase
      .from("shopping_cart_items")
      .insert(cartItems);

    if (cartItemsError) {
      return { error: cartItemsError.message };
    }
  }

  return { cartId: cart.id };
}

/** Lightweight list fetch for dropdowns (id, name, item count only) */
export async function getListsPreview(): Promise<{
  lists: { id: string; name: string; item_count: number }[];
}> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data } = await supabase
    .from("shopping_lists")
    .select("id, name, shopping_list_items(count)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return {
    lists: (data ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      item_count: (l.shopping_list_items as unknown as { count: number }[])?.[0]?.count ?? 0,
    })),
  };
}

export async function getLists() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: lists, error } = await supabase
    .from("shopping_lists")
    .select("*, shopping_list_items(count)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return { error: error.message, lists: [] };
  }

  const listsWithCount = (lists ?? []).map((list) => ({
    ...list,
    item_count:
      (list.shopping_list_items as unknown as { count: number }[])?.[0]
        ?.count ?? 0,
  }));

  return { lists: listsWithCount };
}

export async function getListWithItems(listId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: list, error: listError } = await supabase
    .from("shopping_lists")
    .select("id, user_id, name, created_at")
    .eq("id", listId)
    .eq("user_id", user.id)
    .single();

  if (listError || !list) {
    return { error: listError?.message || "List not found", list: null, items: [] };
  }

  const { data: items, error: itemsError } = await supabase
    .from("shopping_list_items")
    .select("*, products(id, name, barcode)")
    .eq("list_id", listId)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return { error: itemsError.message, list, items: [] };
  }

  return { list, items: items ?? [] };
}
