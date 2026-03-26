import { createServerSupabaseClient } from "@/lib/supabase/server";

const RECEIPTS_BUCKET = "receipts";

export async function uploadReceiptImage(
  file: File,
  userId: string,
): Promise<{ url: string } | { error: string }> {
  const supabase = await createServerSupabaseClient();

  const fileExt = file.name.split(".").pop();
  const fileName = `${userId}/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    return { error: error.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(RECEIPTS_BUCKET).getPublicUrl(fileName);

  return { url: publicUrl };
}
