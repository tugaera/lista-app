"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  uploadReceiptImage,
  createReceiptSignedUrl,
} from "@/lib/supabase/storage";

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
