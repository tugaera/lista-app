"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Category } from "@/types/database";

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

export async function getCategories(): Promise<{ data: Category[]; error: string | null }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, parent_id, is_active, sort_order, created_at")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

export async function createCategory(
  _prevState: { error: string },
  formData: FormData,
): Promise<{ error: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const name = (formData.get("name") as string)?.trim();
  const parentId = (formData.get("parent_id") as string) || null;

  if (!name) return { error: "Category name is required" };

  const { error } = await supabase.from("categories").insert({
    name,
    parent_id: parentId,
  });

  if (error) {
    if (error.code === "23505") return { error: "A category with this name already exists" };
    return { error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/products");
  return { error: "" };
}

export async function updateCategoryName(
  categoryId: string,
  name: string,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  const trimmed = name.trim();
  if (!trimmed) return { error: "Category name cannot be empty" };

  const { error } = await supabase
    .from("categories")
    .update({ name: trimmed })
    .eq("id", categoryId);

  if (error) {
    if (error.code === "23505") return { error: "A category with this name already exists" };
    return { error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}

export async function toggleCategoryActive(
  categoryId: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdminOrModerator(supabase);
  if (authError) return { error: authError };

  // Update the category itself
  const { error } = await supabase
    .from("categories")
    .update({ is_active: isActive })
    .eq("id", categoryId);

  if (error) return { error: error.message };

  // If deactivating a parent, also deactivate all children
  if (!isActive) {
    await supabase
      .from("categories")
      .update({ is_active: false })
      .eq("parent_id", categoryId);
  }

  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}

export type CategoryDependencies = {
  productCount: number;
  subcategoryCount: number;
};

export async function checkCategoryDependencies(
  categoryId: string,
): Promise<{ deps: CategoryDependencies; error?: string }> {
  const supabase = await createServerSupabaseClient();

  const [products, subcats, subProducts] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .or(`category_id.eq.${categoryId},subcategory_id.eq.${categoryId}`),
    supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", categoryId),
    // Also count products linked to subcategories of this category
    supabase
      .from("categories")
      .select("id")
      .eq("parent_id", categoryId),
  ]);

  let totalProducts = products.count ?? 0;
  // Count products linked to subcategories
  if (subProducts.data && subProducts.data.length > 0) {
    const subIds = subProducts.data.map((s) => s.id);
    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .or(subIds.map((id) => `category_id.eq.${id},subcategory_id.eq.${id}`).join(","));
    totalProducts += count ?? 0;
  }

  return {
    deps: {
      productCount: totalProducts,
      subcategoryCount: subcats.count ?? 0,
    },
  };
}

export async function deleteCategory(
  categoryId: string,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const authError = await requireAdmin(supabase);
  if (authError) return { error: authError };

  // Check dependencies
  const { deps } = await checkCategoryDependencies(categoryId);
  if (deps.productCount > 0) {
    return { error: "Cannot delete — category has linked products" };
  }
  if (deps.subcategoryCount > 0) {
    return { error: "Cannot delete — category has subcategories" };
  }

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId);

  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/products");
  return {};
}
