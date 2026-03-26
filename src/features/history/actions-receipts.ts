"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadReceiptImage } from "@/lib/supabase/storage";

export async function getCartReceiptImages(cartId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data, error } = await supabase
    .from("cart_receipt_images")
    .select("id, cart_id, image_url, sort_order, created_at")
    .eq("cart_id", cartId)
    .order("sort_order", { ascending: true });

  if (error) {
    return { error: error.message, images: [] };
  }

  return { images: data ?? [] };
}

export async function uploadCartReceiptImage(
  cartId: string,
  formData: FormData,
): Promise<{ id: string; image_url: string } | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // Verify cart belongs to user
  const { data: cart } = await supabase
    .from("shopping_carts")
    .select("id")
    .eq("id", cartId)
    .eq("user_id", user.id)
    .single();

  if (!cart) {
    return { error: "Cart not found" };
  }

  const file = formData.get("receipt") as File | null;
  if (!file) {
    return { error: "No file provided" };
  }

  // Validate file type
  if (!file.type.startsWith("image/")) {
    return { error: "File must be an image" };
  }

  // Validate file size (10MB max)
  if (file.size > 10 * 1024 * 1024) {
    return { error: "File must be less than 10MB" };
  }

  const result = await uploadReceiptImage(file, user.id);
  if ("error" in result) {
    return { error: result.error };
  }

  // Get current max sort_order
  const { data: existing } = await supabase
    .from("cart_receipt_images")
    .select("sort_order")
    .eq("cart_id", cartId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { data: imageRow, error: insertError } = await supabase
    .from("cart_receipt_images")
    .insert({
      cart_id: cartId,
      image_url: result.url,
      sort_order: nextOrder,
    })
    .select("id, image_url")
    .single();

  if (insertError) {
    return { error: insertError.message };
  }

  return { id: imageRow.id, image_url: imageRow.image_url };
}

export async function deleteCartReceiptImage(
  imageId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("cart_receipt_images")
    .delete()
    .eq("id", imageId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
