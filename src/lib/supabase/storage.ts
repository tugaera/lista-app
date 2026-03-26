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
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    return { error: error.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(RECEIPTS_BUCKET).getPublicUrl(filePath);

  return { path: filePath, url: publicUrl };
}

export function getReceiptPublicUrl(path: string): string {
  // path can be a full URL already (legacy rows) — return as-is
  if (path.startsWith("https://")) return path;

  // Construct the public URL directly without an API call
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${supabaseUrl}/storage/v1/object/public/${RECEIPTS_BUCKET}/${path}`;
}
