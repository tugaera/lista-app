"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  uploadReceiptImage,
  createReceiptSignedUrl,
} from "@/lib/supabase/storage";
import { getAIProvider } from "@/lib/ai";
import type { ExtractedReceipt } from "@/lib/ai";

export type ReceiptImageWithUrl = {
  id: string;
  cart_id: string;
  image_path: string;
  signed_url: string;
  sort_order: number;
  created_at: string;
};

/** Fetches receipt images for a cart and returns them with 1-hour signed URLs */
export async function getCartReceiptImages(
  cartId: string,
): Promise<{ images: ReceiptImageWithUrl[]; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data, error } = await supabase
    .from("cart_receipt_images")
    .select("id, cart_id, image_url, sort_order, created_at")
    .eq("cart_id", cartId)
    .order("sort_order", { ascending: true });

  if (error) return { error: error.message, images: [] };

  const rows = data ?? [];
  if (rows.length === 0) return { images: [] };

  // Generate signed URLs for all images in parallel
  const signedUrls = await Promise.all(
    rows.map((row) => createReceiptSignedUrl(row.image_url)),
  );

  const images: ReceiptImageWithUrl[] = rows.map((row, i) => ({
    id: row.id,
    cart_id: row.cart_id,
    image_path: row.image_url,
    signed_url: signedUrls[i],
    sort_order: row.sort_order,
    created_at: row.created_at,
  }));

  return { images };
}

export async function uploadCartReceiptImage(
  cartId: string,
  formData: FormData,
): Promise<{ id: string; signed_url: string } | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Verify cart belongs to user
  const { data: cart } = await supabase
    .from("shopping_carts")
    .select("id")
    .eq("id", cartId)
    .eq("user_id", user.id)
    .single();

  if (!cart) return { error: "Cart not found" };

  const file = formData.get("receipt") as File | null;
  if (!file) return { error: "No file provided" };
  if (!file.type.startsWith("image/")) return { error: "File must be an image" };
  if (file.size > 10 * 1024 * 1024) return { error: "File must be less than 10MB" };

  const result = await uploadReceiptImage(file, user.id);
  if ("error" in result) return { error: result.error };

  // Get current max sort_order
  const { data: existing } = await supabase
    .from("cart_receipt_images")
    .select("sort_order")
    .eq("cart_id", cartId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  // Store the storage path (not the public URL) so signed URLs always work
  const { data: imageRow, error: insertError } = await supabase
    .from("cart_receipt_images")
    .insert({ cart_id: cartId, image_url: result.path, sort_order: nextOrder })
    .select("id")
    .single();

  if (insertError) return { error: insertError.message };

  // Generate a 1-hour signed URL for immediate display
  const signedUrl = await createReceiptSignedUrl(result.path);

  return { id: imageRow.id, signed_url: signedUrl };
}

export async function extractReceiptItems(
  imageId: string,
): Promise<{ data: ExtractedReceipt } | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  // Fetch the image record (verifies it belongs to this user's cart)
  const { data: image, error: fetchError } = await supabase
    .from("cart_receipt_images")
    .select("id, image_url, cart_id")
    .eq("id", imageId)
    .single();

  if (fetchError || !image) return { error: "Image not found" };

  // Verify cart belongs to user
  const { data: cart } = await supabase
    .from("shopping_carts")
    .select("id")
    .eq("id", image.cart_id)
    .eq("user_id", user.id)
    .single();

  if (!cart) return { error: "Not authorized" };

  // Get a fresh signed URL to fetch the image bytes
  const signedUrl = await createReceiptSignedUrl(image.image_url);
  if (!signedUrl) return { error: "Could not access receipt image" };

  // Fetch image and convert to base64
  let imageBase64: string;
  let mimeType: string;
  try {
    const response = await fetch(signedUrl);
    if (!response.ok) return { error: "Failed to fetch receipt image" };
    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    mimeType = contentType.split(";")[0].trim();
    const buffer = await response.arrayBuffer();
    imageBase64 = Buffer.from(buffer).toString("base64");
  } catch {
    return { error: "Failed to download receipt image" };
  }

  // Call AI provider
  try {
    const ai = getAIProvider();
    const data = await ai.extractReceiptFromImage(imageBase64, mimeType);
    return { data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI extraction failed";
    return { error: message };
  }
}

/**
 * Extracts receipt items directly from an uploaded file without persisting it.
 * Used by the active shopping cart receipt scan feature.
 */
export async function extractReceiptFromFile(
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
  if (file.size > 10 * 1024 * 1024) return { error: "File must be less than 10MB" };

  let imageBase64: string;
  const mimeType = file.type;
  try {
    const buffer = await file.arrayBuffer();
    imageBase64 = Buffer.from(buffer).toString("base64");
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

export async function deleteCartReceiptImage(
  imageId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not authenticated" };

  const { error } = await supabase
    .from("cart_receipt_images")
    .delete()
    .eq("id", imageId);

  if (error) return { success: false, error: error.message };

  return { success: true };
}
