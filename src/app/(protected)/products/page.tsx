import { redirect } from "next/navigation";
import { getStores } from "@/features/stores/actions";
import { getCategories } from "@/features/categories/actions";
import { getBrands } from "@/features/brands/actions";
import { getUnits } from "@/features/units/actions";
import { ProductsPage } from "@/features/products/components/products-page";
import { getCachedUser, getCachedProfile } from "@/lib/supabase/cached";

export default async function ProductsRoute() {
  const user = await getCachedUser();

  if (!user) redirect("/auth/login");

  // Use cached profile (already fetched in layout) instead of a separate DB query
  const profile = await getCachedProfile();
  const isAdminOrMod = profile?.role === "admin" || profile?.role === "moderator";

  const [categoriesResult, brandsResult, unitsResult, storesResult] = await Promise.all([
    getCategories(),
    getBrands(),
    getUnits(),
    isAdminOrMod ? getStores() : Promise.resolve({ stores: [] }),
  ]);

  return (
    <ProductsPage
      categories={categoriesResult.data}
      brands={brandsResult.data}
      units={unitsResult.data}
      stores={isAdminOrMod ? storesResult.stores : undefined}
    />
  );
}
