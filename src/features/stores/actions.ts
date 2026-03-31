"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function requireAdminOrModerator(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "Not authenticated";
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "moderator"].includes(profile.role)) return "Insufficient permissions";
  return null;
}

export type Store = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number | null;
  created_at: string;
};

export async function getStores(): Promise<{ stores: Store[]; error?: string }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("stores")
    .select("id, name, is_active, sort_order, created_at")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) return { stores: [], error: error.message };
  return { stores: data ?? [] };
}

export async function createStore(
  _prevState: { error: string },
  formData: FormData,
): Promise<{ error: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const name = (formData.get("name") as string)?.trim();

  if (!name) return { error: "Store name is required" };

  const { error } = await supabase.from("stores").insert({ name });

  if (error) {
    if (error.code === "23505") return { error: "A store with this name already exists" };
    return { error: error.message };
  }

  revalidatePath("/admin");
  return { error: "" };
}

export async function updateStoreName(
  storeId: string,
  name: string,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Store name cannot be empty" };

  const { error } = await supabase
    .from("stores")
    .update({ name: trimmed })
    .eq("id", storeId);

  if (error) {
    if (error.code === "23505") return { error: "A store with this name already exists" };
    return { error: error.message };
  }

  revalidatePath("/admin");
  return {};
}

export async function updateStoreSortOrder(
  storeId: string,
  sortOrder: number | null,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const { error } = await supabase
    .from("stores")
    .update({ sort_order: sortOrder })
    .eq("id", storeId);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  return {};
}

export async function toggleStoreActive(
  storeId: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const { error } = await supabase
    .from("stores")
    .update({ is_active: isActive })
    .eq("id", storeId);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return {};
}
