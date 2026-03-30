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
  quantity: number,
  options?: { barcode?: string }
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const userEmail = user.email ?? null;
  const name = productName.trim();
  let productId: string | null = null;

  if (options?.barcode) {
    // Barcode-scanned product: find or create in products table
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("barcode", options.barcode)
      .limit(1)
      .single();

    if (existing) {
      productId = existing.id;
    } else {
      const { data: newProduct, error: createError } = await supabase
        .from("products")
        .insert({ name, barcode: options.barcode })
        .select("id")
        .single();

      if (createError || !newProduct) {
        return { error: createError?.message || "Failed to create product" };
      }
      productId = newProduct.id;
    }
  } else {
    // Free text: check if product already exists by name (don't create new)
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .ilike("name", name)
      .limit(1)
      .single();

    if (existing) {
      productId = existing.id;
    }
  }

  // Fetch existing items via RPC (bypasses RLS for shared users)
  const { data: rpcItems } = await supabase.rpc("get_list_items", { p_list_id: listId });
  const existingItems = rpcItems
    ? (rpcItems as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        product_id: (r.product_id as string) ?? null,
        product_name: (r.product_name as string) ?? null,
        planned_quantity: r.planned_quantity as number,
      }))
    : null;

  // Check if product already in this list — merge quantity
  if (productId && existingItems) {
    const existingItem = existingItems.find((i) => i.product_id === productId);
    if (existingItem) {
      const newQty = existingItem.planned_quantity + quantity;
      const { error: rpcErr } = await supabase.rpc("update_list_item", {
        p_item_id: existingItem.id,
        p_list_id: listId,
        p_updates: { planned_quantity: newQty },
      });
      if (rpcErr) {
        // Fallback
        const { error: updateError } = await supabase
          .from("shopping_list_items")
          .update({ planned_quantity: newQty })
          .eq("id", existingItem.id);
        if (updateError) return { error: updateError.message };
      }
      return { item: { id: existingItem.id, added_by_email: userEmail }, merged: true };
    }
  }

  // Also check for duplicate by product_name (free text items)
  if (!productId && existingItems) {
    const existingByName = existingItems.find(
      (i) => !i.product_id && i.product_name?.toLowerCase() === name.toLowerCase()
    );
    if (existingByName) {
      const newQty = existingByName.planned_quantity + quantity;
      const { error: rpcErr } = await supabase.rpc("update_list_item", {
        p_item_id: existingByName.id,
        p_list_id: listId,
        p_updates: { planned_quantity: newQty },
      });
      if (rpcErr) {
        const { error: updateError } = await supabase
          .from("shopping_list_items")
          .update({ planned_quantity: newQty })
          .eq("id", existingByName.id);
        if (updateError) return { error: updateError.message };
      }
      return { item: { id: existingByName.id, added_by_email: userEmail }, merged: true };
    }
  }

  // Insert via security definer RPC (bypasses RLS for shared users)
  const { data: newItemId, error: rpcInsertErr } = await supabase.rpc("insert_list_item", {
    p_list_id: listId,
    p_product_id: productId,
    p_product_name: name,
    p_planned_quantity: quantity,
    p_added_by: user.id,
  });

  if (rpcInsertErr) {
    // Fallback to direct insert (works for owner)
    const insertPayload: Record<string, unknown> = {
      list_id: listId,
      planned_quantity: quantity,
      product_name: name,
      added_by: user.id,
    };
    if (productId) insertPayload.product_id = productId;

    const { data, error } = await supabase
      .from("shopping_list_items")
      .insert(insertPayload as never)
      .select("id, planned_quantity, product_id, product_name")
      .single();

    if (error) return { error: error.message };
    return { item: { ...data, added_by_email: userEmail }, productName: name };
  }

  return {
    item: { id: newItemId as string, planned_quantity: quantity, product_id: productId, product_name: name, added_by_email: userEmail },
    productName: name,
  };
}

export async function removeListItem(itemId: string, listId?: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  if (listId) {
    // Use security definer RPC (works for shared users)
    const { error: rpcErr } = await supabase.rpc("delete_list_item", {
      p_item_id: itemId,
      p_list_id: listId,
    });
    if (!rpcErr) return { success: true };
  }

  // Fallback to direct delete
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
  quantity: number,
  listId?: string
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  if (listId) {
    // Use security definer RPC (works for shared users)
    const { error: rpcErr } = await supabase.rpc("update_list_item", {
      p_item_id: itemId,
      p_list_id: listId,
      p_updates: { planned_quantity: quantity },
    });
    if (!rpcErr) return { success: true };
  }

  // Fallback to direct update
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
    .select("product_id, product_name, planned_quantity")
    .eq("list_id", listId);

  if (itemsError || !listItems?.length) {
    return { error: itemsError?.message || "No items in list" };
  }

  // For items with product_id, find the latest product_entry
  const productIds = listItems
    .filter((item) => item.product_id)
    .map((item) => item.product_id as string);

  let latestEntries: { id: string; product_id: string; store_id: string; price: number; quantity: number; created_at: string; product_name: string; barcode: string | null; store_name: string }[] = [];
  if (productIds.length > 0) {
    const { data, error: entriesError } = await supabase
      .from("latest_product_prices")
      .select("id, product_id, store_id, price, quantity, created_at, product_name, barcode, store_name")
      .in("product_id", productIds);

    if (entriesError) {
      return { error: entriesError.message };
    }
    latestEntries = (data ?? []) as typeof latestEntries;
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

  // Create cart items — products with entries get price, free-text items get price 0
  const cartItems = listItems
    .map((listItem) => {
      if (listItem.product_id) {
        const entry = latestEntries?.find(
          (e) => e.product_id === listItem.product_id
        );
        return {
          cart_id: cart.id,
          product_id: listItem.product_id,
          product_name: entry?.product_name ?? listItem.product_name ?? "Unknown",
          product_barcode: entry?.barcode ?? null,
          price: entry?.price ?? 0,
          quantity: listItem.planned_quantity,
        };
      } else {
        // Free-text item — no product in DB
        return {
          cart_id: cart.id,
          product_id: null,
          product_name: listItem.product_name ?? "Unknown",
          product_barcode: null,
          price: 0,
          quantity: listItem.planned_quantity,
        };
      }
    })
    .filter(Boolean) as {
    cart_id: string;
    product_id: string | null;
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

  // Try direct query first (owner)
  let list: { id: string; user_id: string; name: string; created_at: string } | null = null;
  const { data: directList } = await supabase
    .from("shopping_lists")
    .select("id, user_id, name, created_at")
    .eq("id", listId)
    .eq("user_id", user.id)
    .single();

  if (directList) {
    list = directList;
  } else {
    // Fallback: use RPC for shared access (list shared with user, or tracking list on shared cart)
    const { data: rpcList } = await supabase.rpc("get_list_by_id", { p_list_id: listId });
    if (rpcList) {
      const parsed = typeof rpcList === "string" ? JSON.parse(rpcList) : rpcList;
      if (parsed) {
        list = { id: parsed.id, user_id: parsed.user_id, name: parsed.name, created_at: parsed.created_at };
      }
    }
  }

  if (!list) {
    return { error: "List not found", list: null, items: [] };
  }

  // Try direct query for items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items: any[] = [];
  const { data: directItems, error: itemsError } = await supabase
    .from("shopping_list_items")
    .select("*, products(id, name, barcode)")
    .eq("list_id", listId)
    .order("created_at", { ascending: true });

  if (directItems) {
    items = directItems;
  } else {
    // Fallback: use RPC
    const { data: rpcItems } = await supabase.rpc("get_list_items", { p_list_id: listId });
    if (rpcItems) {
      const parsed = typeof rpcItems === "string" ? JSON.parse(rpcItems) : rpcItems;
      items = Array.isArray(parsed) ? parsed : [];
    }
  }

  return { list, items: items ?? [] };
}
