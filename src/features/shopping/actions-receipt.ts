"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uploadReceiptImage } from "@/lib/supabase/storage";
import { createOcrService, type OcrResult } from "@/lib/services/receipt-ocr";

export async function uploadReceipt(
  cartId: string,
  formData: FormData
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { url: null, error: "Not authenticated" };
  }

  const file = formData.get("receipt") as File | null;

  if (!file) {
    return { url: null, error: "No file provided" };
  }

  const result = await uploadReceiptImage(file, user.id);

  if ("error" in result) {
    return { url: null, error: result.error };
  }

  const { error: updateError } = await supabase
    .from("shopping_carts")
    .update({ receipt_image_url: result.path })
    .eq("id", cartId);

  if (updateError) {
    return { url: null, error: updateError.message };
  }

  return { url: result.path, error: null };
}

export async function processReceipt(
  imageUrl: string
): Promise<{ data: OcrResult | null; error: string | null }> {
  try {
    const ocrService = createOcrService();
    const result = await ocrService.processImage(imageUrl);
    return { data: result, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "OCR processing failed";
    return { data: null, error: message };
  }
}
