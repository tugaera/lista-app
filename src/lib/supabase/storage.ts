import { createServerSupabaseClient } from "@/lib/supabase/server";

const RECEIPTS_BUCKET = "receipts";

export async function uploadReceiptImage(
  file: File,
  userId: string,
): Promise<{ path: string; url: string } | { error: string }> {
  const supabase = await createServerSupabaseClient();

  const fileExt = file.name.split(".").pop();
  const filePath = `${userId}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(filePath, file, { cacheControl: "3600", upsert: false });

  if (error) {
    return { error: error.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(RECEIPTS_BUCKET).getPublicUrl(filePath);

  return { path: filePath, url: publicUrl };
}

/**
 * Generate a 1-hour signed URL for a receipt image stored in the private bucket.
 * `storagePath` can be:
 *   - a raw path like "userId/1234-uuid.jpg"
 *   - a legacy full URL (https://...supabase.co/storage/v1/object/...)
 */
export async function createReceiptSignedUrl(
  storagePath: string,
): Promise<string> {
  const supabase = await createServerSupabaseClient();

  // If it's a full URL, extract the path after the bucket name
  let path = storagePath;
  if (storagePath.startsWith("https://")) {
    const match = storagePath.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/receipts\/(.+?)(?:\?|$)/,
    );
    if (!match) return "";
    path = decodeURIComponent(match[1]);
  }

  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, 60 * 60); // 1 hour

  if (error || !data?.signedUrl) return "";
  return data.signedUrl;
}
