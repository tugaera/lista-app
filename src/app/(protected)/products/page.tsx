import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStores } from "@/features/stores/actions";
import { getCategories } from "@/features/categories/actions";
import { getBrands } from "@/features/brands/actions";
import { getUnits } from "@/features/units/actions";
import { ProductsPage } from "@/features/products/components/products-page";

export default async function ProductsRoute() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const [categoriesResult, brandsResult, unitsResult, storesResult, profileResult] = await Promise.all([
    getCategories(),
    getBrands(),
    getUnits(),
    getStores(),
    supabase.from("profiles").select("role").eq("id", user.id).single(),
  ]);

  const isAdminOrMod = profileResult.data?.role === "admin" || profileResult.data?.role === "moderator";

  return (
    <ProductsPage
      categories={categoriesResult.data}
      brands={brandsResult.data}
      units={unitsResult.data}
      stores={isAdminOrMod ? storesResult.stores : undefined}
    />
  );
}
