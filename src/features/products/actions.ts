"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Product, Category, ProductEntry } from "@/types/database";

export interface ProductWithLatestPrice extends Product {
  category_name: string | null;
  latest_price: number | null;
  latest_store_name: string | null;
}

export interface ProductWithHistory extends Product {
  category_name: string | null;
  entries: (ProductEntry & { store_name: string })[];
}

export async function searchProducts(
  query: string
): Promise<{ data: ProductWithLatestPrice[]; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, barcode, category_id, created_at, categories(name)")
    .ilike("name", `%${query}%`)
    .order("name")
    .limit(50);

  if (error) {
    return { data: [], error: error.message };
  }

  const productIds = products.map((p) => p.id);

  const { data: latestPrices } = await supabase
    .from("latest_product_prices")
    .select("id, product_id, store_id, price, quantity, created_at, product_name, barcode, store_name")
    .in("product_id", productIds);

  const priceMap = new Map(
    (latestPrices ?? []).map((lp) => [lp.product_id, lp])
  );

  const results: ProductWithLatestPrice[] = products.map((p) => {
    const latest = priceMap.get(p.id);
    const cat = p.categories as unknown as { name: string } | null;
    return {
      id: p.id,
      name: p.name,
      barcode: p.barcode,
      category_id: p.category_id,
      created_at: p.created_at,
      category_name: cat?.name ?? null,
      latest_price: latest?.price ?? null,
      latest_store_name: latest?.store_name ?? null,
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
    .select("id, name, barcode, category_id, created_at, categories(name)")
    .eq("barcode", barcode)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return { data: null, error: null };
    }
    return { data: null, error: error.message };
  }

  const { data: latestEntry } = await supabase
    .from("latest_product_prices")
    .select("id, product_id, store_id, price, quantity, created_at, product_name, barcode, store_name")
    .eq("product_id", product.id)
    .limit(1)
    .single();

  const cat = product.categories as unknown as { name: string } | null;

  return {
    data: {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      category_id: product.category_id,
      created_at: product.created_at,
      category_name: cat?.name ?? null,
      latest_price: latestEntry?.price ?? null,
      latest_store_name: latestEntry?.store_name ?? null,
    },
    error: null,
  };
}

export async function createProduct(data: {
  name: string;
  barcode?: string;
  categoryId?: string;
}): Promise<{ data: Product | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      name: data.name,
      barcode: data.barcode ?? null,
      category_id: data.categoryId ?? null,
    })
    .select("id, name, barcode, category_id, created_at")
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
    .select("id, name, created_at")
    .order("name");

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
    .select("id, name, barcode, category_id, created_at, categories(name)")
    .eq("id", productId)
    .single();

  if (productError) {
    return { data: null, error: productError.message };
  }

  const { data: entries, error: entriesError } = await supabase
    .from("product_entries")
    .select("id, product_id, store_id, price, quantity, created_at, stores(name)")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (entriesError) {
    return { data: null, error: entriesError.message };
  }

  const cat = product.categories as unknown as { name: string } | null;

  const entriesWithStore = (entries ?? []).map((e) => {
    const store = e.stores as unknown as { name: string } | null;
    return {
      id: e.id,
      product_id: e.product_id,
      store_id: e.store_id,
      price: e.price,
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
      created_at: product.created_at,
      category_name: cat?.name ?? null,
      entries: entriesWithStore,
    },
    error: null,
  };
}
