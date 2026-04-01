import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStores } from "@/features/stores/actions";
import { ProductsPage } from "@/features/products/components/products-page";

export default async function ProductsRoute() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Fetch categories (all users) and stores (needed for admin price entry form)
  const [categoriesResult, storesResult, profileResult] = await Promise.all([
    supabase.from("categories").select("id, name, created_at").order("name"),
    getStores(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  const isAdminOrMod = profileResult.data?.role === "admin" || profileResult.data?.role === "moderator";

  return (
    <ProductsPage
      categories={categoriesResult.data ?? []}
      stores={isAdminOrMod ? storesResult.stores : undefined}
    />
  );
}
