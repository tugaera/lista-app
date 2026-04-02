"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Unit } from "@/types/database";

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

export async function getUnits(): Promise<{ data: Unit[]; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("units")
    .select("id, name, abbreviation, created_at")
    .order("name", { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

export async function createUnit(
  _prevState: { error: string },
  formData: FormData,
): Promise<{ error: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const name = (formData.get("name") as string)?.trim();
  const abbreviation = (formData.get("abbreviation") as string)?.trim();

  if (!name) return { error: "Unit name is required" };
  if (!abbreviation) return { error: "Abbreviation is required" };

  const { error } = await supabase.from("units").insert({ name, abbreviation });

  if (error) {
    if (error.code === "23505") return { error: "A unit with this abbreviation already exists" };
    return { error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/products");
  return { error: "" };
}

export async function updateUnit(
  unitId: string,
  data: { name: string; abbreviation: string },
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const name = data.name.trim();
  const abbreviation = data.abbreviation.trim();
  if (!name) return { error: "Unit name cannot be empty" };
  if (!abbreviation) return { error: "Abbreviation cannot be empty" };

  const { error } = await supabase
    .from("units")
    .update({ name, abbreviation })
    .eq("id", unitId);

  if (error) {
    if (error.code === "23505") return { error: "A unit with this abbreviation already exists" };
    return { error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}

export async function checkUnitDependencies(
  unitId: string,
): Promise<{ productCount: number }> {
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("unit_id", unitId);

  return { productCount: count ?? 0 };
}

export async function deleteUnit(
  unitId: string,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdmin(supabase);
  if (authError) return { error: authError };

  const { productCount } = await checkUnitDependencies(unitId);
  if (productCount > 0) {
    return { error: "Cannot delete — unit has linked products" };
  }

  const { error } = await supabase
    .from("units")
    .delete()
    .eq("id", unitId);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}
