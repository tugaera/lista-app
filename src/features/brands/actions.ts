"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Brand } from "@/types/database";

async function requireAdminOrModerator(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "Not authenticated";
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "moderator"].includes(profile.role)) return "Insufficient permissions";
  return null;
}

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "Not authenticated";
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return "Only admins can perform this action";
  return null;
}

async function getUserRole(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role ?? null;
}

export async function getBrands(): Promise<{ data: Brand[]; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("brands")
    .select("id, name, is_active, is_verified, created_at")
    .order("name", { ascending: true });

  // Fallback if is_verified column doesn't exist yet
  if (error) {
    const fallback = await supabase
      .from("brands")
      .select("id, name, is_active, created_at")
      .order("name", { ascending: true });
    if (fallback.error) return { data: [], error: fallback.error.message };
    return { data: (fallback.data ?? []).map((b) => ({ ...b, is_verified: true })), error: null };
  }

  return { data: data ?? [], error: null };
}

export async function createBrand(
  _prevState: { error: string },
  formData: FormData,
): Promise<{ error: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "Brand name is required" };

  // Brands created by admin/mod are auto-verified
  const { error } = await supabase.from("brands").insert({ name, is_verified: true });

  if (error) {
    if (error.code === "23505") return { error: "A brand with this name already exists" };
    return { error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/products");
  return { error: "" };
}

export async function updateBrandName(
  brandId: string,
  name: string,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Brand name cannot be empty" };

  const { error } = await supabase
    .from("brands")
    .update({ name: trimmed })
    .eq("id", brandId);

  if (error) {
    if (error.code === "23505") return { error: "A brand with this name already exists" };
    return { error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}

export async function toggleBrandActive(
  brandId: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const { error } = await supabase
    .from("brands")
    .update({ is_active: isActive })
    .eq("id", brandId);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}

export async function confirmBrand(brandId: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const { error } = await supabase
    .from("brands")
    .update({ is_verified: true })
    .eq("id", brandId);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}

export async function checkBrandDependencies(
  brandId: string,
): Promise<{ productCount: number }> {
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId);

  return { productCount: count ?? 0 };
}

export async function deleteBrand(
  brandId: string,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdmin(supabase);
  if (authError) return { error: authError };

  const { productCount } = await checkBrandDependencies(brandId);
  if (productCount > 0) {
    return { error: "Cannot delete — brand has linked products" };
  }

  const { error } = await supabase
    .from("brands")
    .delete()
    .eq("id", brandId);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}

/** Auto-create a brand if it doesn't exist. Regular users create unverified brands. */
export async function getOrCreateBrand(name: string): Promise<{ id: string | null; error?: string }> {
  const supabase = await createServerSupabaseClient();

  const trimmed = name.trim();
  if (!trimmed) return { id: null };

  // Try to find existing brand (case-insensitive)
  const { data: existing } = await supabase
    .from("brands")
    .select("id")
    .ilike("name", trimmed)
    .limit(1)
    .single();

  if (existing) return { id: existing.id };

  // Determine if user is admin/mod → auto-verify
  const role = await getUserRole(supabase);
  const isVerified = role === "admin" || role === "moderator";

  // Create new brand
  const { data: created, error } = await supabase
    .from("brands")
    .insert({ name: trimmed, is_verified: isVerified })
    .select("id")
    .single();

  if (error) return { id: null, error: error.message };
  return { id: created.id };
}
