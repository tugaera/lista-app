"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAIProvider } from "@/lib/ai";
import type { ExtractedReceipt } from "@/lib/ai";

/** Scan a receipt image file with AI and return extracted items. Does NOT save the image. */
export async function scanReceiptPhoto(
  formData: FormData,
): Promise<{ data: ExtractedReceipt } | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const file = formData.get("receipt") as File | null;
  if (!file) return { error: "No file provided" };
  if (!file.type.startsWith("image/")) return { error: "File must be an image" };
  if (file.size > 20 * 1024 * 1024) return { error: "File must be less than 20MB" };

  let imageBase64: string;
  let mimeType: string;
  try {
    const buffer = await file.arrayBuffer();
    imageBase64 = Buffer.from(buffer).toString("base64");
    mimeType = file.type;
  } catch {
    return { error: "Failed to read image file" };
  }

  try {
    const ai = getAIProvider();
    const data = await ai.extractReceiptFromImage(imageBase64, mimeType);
    return { data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI extraction failed";
    return { error: message };
  }
}

export type ImportReceiptItem = {
  name: string;
  quantity: number;
  unit_price: number;
};

/** Create a finalized cart from selected receipt items. */
export async function importReceiptAsCart(params: {
  items: ImportReceiptItem[];
  storeId: string;
  receiptDate?: string | null;
  total: number;
}): Promise<{ cartId: string } | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { items, storeId, receiptDate, total } = params;
  if (items.length === 0) return { error: "No items to import" };
  if (!storeId) return { error: "Please select a store" };

  // 1. Verify store exists
  const { data: store } = await supabase
    .from("stores")
    .select("id")
    .eq("id", storeId)
    .single();
  if (!store) return { error: "Selected store not found" };

  // 2. Create a finalized cart
  const finalizedAt = receiptDate ? new Date(receiptDate).toISOString() : new Date().toISOString();
  const { data: cart, error: cartErr } = await supabase
    .from("shopping_carts")
    .insert({ user_id: user.id, total, finalized_at: finalizedAt, store_id: storeId })
    .select("id")
    .single();

  if (cartErr) return { error: `Failed to create cart: ${cartErr.message}` };

  // 3. For each item: find/create product → product_entry → cart_item
  for (const item of items) {
    const cleanName = item.name.trim();

    // Find or create product
    let productId: string;
    const { data: existingProduct } = await supabase
      .from("products")
      .select("id")
      .ilike("name", cleanName)
      .limit(1)
      .maybeSingle();

    if (existingProduct) {
      productId = existingProduct.id;
    } else {
      const { data: newProduct, error: productErr } = await supabase
        .from("products")
        .insert({ name: cleanName })
        .select("id")
        .single();
      if (productErr) continue; // skip this item on error, don't abort entire import
      productId = newProduct.id;
    }

    // Create cart item directly with price (product_entries created via finalizeCart pattern)
    const { error: itemErr } = await supabase
      .from("shopping_cart_items")
      .insert({ cart_id: cart.id, product_id: productId, product_name: cleanName, price: item.unit_price, quantity: item.quantity });

    if (itemErr) continue;

    // Also record in product_entries immediately since this is a finalized import
    await supabase
      .from("product_entries")
      .insert({ product_id: productId, store_id: storeId, price: item.unit_price, quantity: item.quantity });
  }

  return { cartId: cart.id };
}
