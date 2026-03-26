import { createServerSupabaseClient } from "@/lib/supabase/server";

const RECEIPTS_BUCKET = "receipts";

export async function uploadReceiptImage(
  file: File,
  userId: string,
): Promise<{ path: string } | { error: string }> {
  const supabase = await createServerSupabaseClient();

  const fileExt = file.name.split(".").pop();
  const filePath = `${userId}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    return { error: error.message };
  }

  return { path: filePath };
}

export async function getReceiptSignedUrl(
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data) return null;
  return data.signedUrl;
}

export async function getReceiptSignedUrls(
  paths: string[],
  expiresInSeconds = 3600,
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);

  if (error || !data) return {};

  const result: Record<string, string> = {};
  for (const item of data) {
    if (item.signedUrl && item.path) {
      result[item.path] = item.signedUrl;
    }
  }
  return result;
}
