"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Product, Category, ProductEntry } from "@/types/database";

export interface ProductWithLatestPrice extends Product {
  category_name: string | null;
  subcategory_name: string | null;
  brand_name: string | null;
  unit_abbreviation: string | null;
  latest_price: number | null;
  latest_original_price: number | null;
  latest_store_name: string | null;
  is_active: boolean;
}

export interface ProductWithHistory extends Product {
  category_name: string | null;
  subcategory_name: string | null;
  brand_name: string | null;
  unit_abbreviation: string | null;
  entries: (ProductEntry & { store_name: string })[];
}

export async function searchProducts(
  query: string
): Promise<{ data: ProductWithLatestPrice[]; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, barcode, category_id, subcategory_id, brand_id, tags, measurement_quantity, unit_id, is_active, created_at, categories(name)")
    .ilike("name", `%${query}%`)
    .eq("is_active", true)
    .order("name")
    .limit(50);

  if (error) {
    return { data: [], error: error.message };
  }

  const productIds = products.map((p) => p.id);

  // Query product_entries directly (includes original_price from migration 010)
  let latestEntries = await supabase
    .from("product_entries")
    .select("product_id, price, original_price, created_at, stores(name)")
    .in("product_id", productIds)
    .order("created_at", { ascending: false });

  // Fallback if original_price column doesn't exist yet (migration 010)
  if (latestEntries.error?.message?.includes("original_price")) {
    latestEntries = await supabase
      .from("product_entries")
      .select("product_id, price, created_at, stores(name)")
      .in("product_id", productIds)
      .order("created_at", { ascending: false }) as typeof latestEntries;
  }

  // Keep only the most recent entry per product
  const priceMap = new Map<string, Record<string, unknown>>();
  for (const entry of (latestEntries.data ?? []) as unknown as Record<string, unknown>[]) {
    const pid = entry.product_id as string;
    if (!priceMap.has(pid)) {
      priceMap.set(pid, entry);
    }
  }

  const results: ProductWithLatestPrice[] = products.map((p) => {
    const latest = priceMap.get(p.id);
    const store = latest?.stores as { name: string } | null;
    const cat = p.categories as unknown as { name: string } | null;
    return {
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      category_id: p.category_id,
      subcategory_id: (p as Record<string, unknown>).subcategory_id as string | null,
      brand_id: (p as Record<string, unknown>).brand_id as string | null,
      tags: ((p as Record<string, unknown>).tags as string[]) ?? [],
      measurement_quantity: (p as Record<string, unknown>).measurement_quantity as number | null,
      unit_id: (p as Record<string, unknown>).unit_id as string | null,
      is_active: p.is_active,
      created_at: p.created_at,
      category_name: cat?.name ?? null,
      subcategory_name: null,
      brand_name: null,
      unit_abbreviation: null,
      latest_price: (latest?.price as number) ?? null,
      latest_original_price: (latest?.original_price as number) ?? null,
      latest_store_name: store?.name ?? null,
    };
  });

  return { data: results, error: null };
}

export async function getProductByBarcode(
  barcode: string
): Promise<{ data: ProductWithLatestPrice | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: product, error } = await supabase
    .from("products")
    .select("id, name, barcode, category_id, subcategory_id, brand_id, tags, measurement_quantity, unit_id, is_active, created_at, categories(name)")
    .eq("barcode", barcode)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { data: null, error: null };
    }
    return { data: null, error: error.message };
  }

  let latestResult = await supabase
    .from("product_entries")
    .select("product_id, price, original_price, created_at, stores(name)")
    .eq("product_id", product.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Fallback if original_price column doesn't exist yet
  if (latestResult.error?.message?.includes("original_price")) {
    latestResult = await supabase
      .from("product_entries")
      .select("product_id, price, created_at, stores(name)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single() as typeof latestResult;
  }

  const latestEntry = latestResult.data as Record<string, unknown> | null;
  const latestStore = latestEntry?.stores as { name: string } | null;

  const cat = product.categories as unknown as { name: string } | null;

  return {
    data: {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      category_id: product.category_id,
      subcategory_id: (product as Record<string, unknown>).subcategory_id as string | null,
      brand_id: (product as Record<string, unknown>).brand_id as string | null,
      tags: ((product as Record<string, unknown>).tags as string[]) ?? [],
      measurement_quantity: (product as Record<string, unknown>).measurement_quantity as number | null,
      unit_id: (product as Record<string, unknown>).unit_id as string | null,
      is_active: product.is_active,
      created_at: product.created_at,
      category_name: cat?.name ?? null,
      subcategory_name: null,
      brand_name: null,
      unit_abbreviation: null,
      latest_price: (latestEntry?.price as number) ?? null,
      latest_original_price: (latestEntry?.original_price as number) ?? null,
      latest_store_name: latestStore?.name ?? null,
    },
    error: null,
  };
}

export async function createProduct(data: {
  name: string;
  barcode?: string;
  categoryId?: string;
  subcategoryId?: string;
  brandId?: string | null;
  tags?: string[];
  measurementQuantity?: number | null;
  unitId?: string;
}): Promise<{ data: Product | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      name: data.name,
      barcode: data.barcode ?? null,
      category_id: data.categoryId ?? null,
      subcategory_id: data.subcategoryId ?? null,
      brand_id: data.brandId ?? null,
      tags: data.tags ?? [],
      measurement_quantity: data.measurementQuantity ?? null,
      unit_id: data.unitId ?? null,
    })
    .select("id, name, barcode, category_id, subcategory_id, brand_id, tags, measurement_quantity, unit_id, is_active, created_at")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: product, error: null };
}

export async function getCategories(): Promise<{
  data: Category[];
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, parent_id, is_active, sort_order, created_at")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function getProductWithHistory(
  productId: string
): Promise<{ data: ProductWithHistory | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, name, barcode, category_id, subcategory_id, brand_id, tags, measurement_quantity, unit_id, is_active, created_at, categories(name)")
    .eq("id", productId)
    .single();

  if (productError) {
    return { data: null, error: productError.message };
  }

  let entriesResult = await supabase
    .from("product_entries")
    .select("id, product_id, store_id, price, original_price, quantity, created_at, stores(name)")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  // Fallback if original_price column doesn't exist yet (migration 010)
  if (entriesResult.error?.message?.includes("original_price")) {
    entriesResult = await supabase
      .from("product_entries")
      .select("id, product_id, store_id, price, quantity, created_at, stores(name)")
      .eq("product_id", productId)
      .order("created_at", { ascending: false }) as typeof entriesResult;
  }

  if (entriesResult.error) {
    return { data: null, error: entriesResult.error.message };
  }

  const entries = entriesResult.data;

  const cat = product.categories as unknown as { name: string } | null;

  // Resolve subcategory name if subcategory_id is set
  let subcategoryName: string | null = null;
  const subcategoryId = (product as Record<string, unknown>).subcategory_id as string | null;
  if (subcategoryId) {
    const { data: subcat } = await supabase
      .from("categories")
      .select("name")
      .eq("id", subcategoryId)
      .single();
    subcategoryName = subcat?.name ?? null;
  }

  const entriesWithStore = (entries ?? []).map((e) => {
    const store = e.stores as unknown as { name: string } | null;
    return {
      id: e.id,
      product_id: e.product_id,
      store_id: e.store_id,
      price: e.price,
      original_price: (e as unknown as { original_price?: number | null }).original_price ?? null,
      quantity: e.quantity,
      created_at: e.created_at,
      store_name: store?.name ?? "Unknown",
    };
  });

  return {
    data: {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      category_id: product.category_id,
      subcategory_id: subcategoryId,
      brand_id: (product as Record<string, unknown>).brand_id as string | null,
      tags: ((product as Record<string, unknown>).tags as string[]) ?? [],
      measurement_quantity: (product as Record<string, unknown>).measurement_quantity as number | null,
      unit_id: (product as Record<string, unknown>).unit_id as string | null,
      is_active: product.is_active,
      created_at: product.created_at,
      category_name: cat?.name ?? null,
      subcategory_name: subcategoryName,
      brand_name: null,
      unit_abbreviation: null,
      entries: entriesWithStore,
    },
    error: null,
  };
}

// ── Admin actions ─────────────────────────────────────────────────────────────

export async function getAdminProducts(query: string = ""): Promise<{
  data: ProductWithLatestPrice[];
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  let q = supabase
    .from("products")
    .select("id, name, barcode, category_id, subcategory_id, brand_id, tags, measurement_quantity, unit_id, is_active, created_at, categories(name)")
    .order("name")
    .limit(100);

  if (query.length >= 2) {
    q = q.ilike("name", `%${query}%`);
  }

  const { data: products, error } = await q;
  if (error) return { data: [], error: error.message };

  const productIds = (products ?? []).map((p) => p.id);
  const { data: latestPrices } = productIds.length
    ? await supabase
        .from("latest_product_prices")
        .select("product_id, price, store_name")
        .in("product_id", productIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  // Keep only the most recent price per product
  const priceMap = new Map<string, { product_id: string; price: number; store_name: string }>();
  for (const lp of latestPrices ?? []) {
    if (!priceMap.has(lp.product_id)) {
      priceMap.set(lp.product_id, lp);
    }
  }

  return {
    data: (products ?? []).map((p) => {
      const latest = priceMap.get(p.id);
      const cat = p.categories as unknown as { name: string } | null;
      return {
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        category_id: p.category_id,
        subcategory_id: (p as Record<string, unknown>).subcategory_id as string | null,
        brand_id: (p as Record<string, unknown>).brand_id as string | null,
        tags: ((p as Record<string, unknown>).tags as string[]) ?? [],
        measurement_quantity: (p as Record<string, unknown>).measurement_quantity as number | null,
        unit_id: (p as Record<string, unknown>).unit_id as string | null,
        is_active: p.is_active ?? true,
        created_at: p.created_at,
        category_name: cat?.name ?? null,
        subcategory_name: null,
        brand_name: null,
        unit_abbreviation: null,
        latest_price: latest?.price ?? null,
        latest_original_price: null,
        latest_store_name: latest?.store_name ?? null,
      };
    }),
    error: null,
  };
}

async function requireAdminOrModerator(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "Not authenticated";
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "moderator"].includes(profile.role)) return "Insufficient permissions";
  return null;
}

export async function adminUpdateProduct(
  productId: string,
  data: {
    name: string;
    barcode?: string;
    categoryId?: string;
    subcategoryId?: string;
    brandId?: string | null;
    tags?: string[];
    measurementQuantity?: number | null;
    unitId?: string;
  },
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const name = data.name.trim();
  if (!name) return { error: "Name is required" };

  const { error } = await supabase
    .from("products")
    .update({
      name,
      barcode: data.barcode?.trim() || null,
      category_id: data.categoryId || null,
      subcategory_id: data.subcategoryId || null,
      brand_id: data.brandId ?? null,
      tags: data.tags ?? [],
      measurement_quantity: data.measurementQuantity ?? null,
      unit_id: data.unitId || null,
    })
    .eq("id", productId);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}

export async function adminToggleProductActive(
  productId: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", productId);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}

export type ProductDependencies = {
  cartItemCount: number;   // active (non-finalized) cart items
  historyCount: number;    // finalized cart items
  priceEntryCount: number; // product_entries (price history)
  listItemCount: number;   // shopping list items
};

export async function checkProductDependencies(
  productId: string,
): Promise<{ deps: ProductDependencies; error?: string }> {
  const supabase = await createServerSupabaseClient();

  const [cartItems, priceEntries, listItems] = await Promise.all([
    // cart items (split by finalized status via the cart join)
    supabase
      .from("shopping_cart_items")
      .select("id, shopping_carts!inner(finalized_at)")
      .eq("product_id", productId),
    // price history entries
    supabase
      .from("product_entries")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
    // shopping list items
    supabase
      .from("shopping_list_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId),
  ]);

  const allCartItems = cartItems.data ?? [];
  const cartItemCount = allCartItems.filter(
    (i) => !(i.shopping_carts as unknown as { finalized_at: string | null }).finalized_at,
  ).length;
  const historyCount = allCartItems.filter(
    (i) => !!(i.shopping_carts as unknown as { finalized_at: string | null }).finalized_at,
  ).length;

  return {
    deps: {
      cartItemCount,
      historyCount,
      priceEntryCount: priceEntries.count ?? 0,
      listItemCount: listItems.count ?? 0,
    },
  };
}

export async function adminDeleteProduct(
  productId: string,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}

// ── Admin price entry CRUD ────────────────────────────────────────────────────

export type PriceEntryData = {
  storeId: string;
  price: number;
  originalPrice: number | null;
  quantity: number;
  date: string; // ISO string
};

export async function adminAddPriceEntry(
  productId: string,
  data: PriceEntryData,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const payload: Record<string, unknown> = {
    product_id: productId,
    store_id: data.storeId,
    price: data.price,
    quantity: data.quantity,
    created_at: data.date,
  };
  if (data.originalPrice != null) payload.original_price = data.originalPrice;

  const { error } = await supabase.from("product_entries").insert(payload as never);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}

export async function adminUpdatePriceEntry(
  entryId: string,
  data: PriceEntryData,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const payload: Record<string, unknown> = {
    store_id: data.storeId,
    price: data.price,
    quantity: data.quantity,
    created_at: data.date,
  };
  if (data.originalPrice != null) {
    payload.original_price = data.originalPrice;
  } else {
    payload.original_price = null;
  }

  const { data: updated, error } = await supabase
    .from("product_entries")
    .update(payload as never)
    .eq("id", entryId)
    .select("id");

  if (error) return { error: error.message };
  if (!updated || updated.length === 0) {
    return { error: "Update failed — entry not found or permission denied" };
  }
  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}

export async function adminDeletePriceEntry(entryId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const { error } = await supabase.from("product_entries").delete().eq("id", entryId);
  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}
