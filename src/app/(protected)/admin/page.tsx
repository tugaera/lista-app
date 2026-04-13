import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/cached";
import { getUsers } from "@/features/users/actions";
import { getStores } from "@/features/stores/actions";
import { getCategories } from "@/features/categories/actions";
import { getBrands } from "@/features/brands/actions";
import { getUnits } from "@/features/units/actions";
import { UserList } from "@/features/users/components/user-list";
import { StoreList } from "@/features/stores/components/store-list";
import { CategoryList } from "@/features/categories/components/category-list";
import { BrandList } from "@/features/brands/components/brand-list";
import { UnitList } from "@/features/units/components/unit-list";
import { AdminTabs } from "./admin-tabs";

export default async function AdminPage() {
  const user = await getCachedUser();

  if (!user) redirect("/auth/login");

  const [usersResult, storesResult, categoriesResult, brandsResult, unitsResult] = await Promise.all([
    getUsers(),
    getStores(),
    getCategories(),
    getBrands(),
    getUnits(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <AdminTabs
        usersPanel={<UserList users={usersResult.users} />}
        storesPanel={<StoreList initialStores={storesResult.stores} />}
        categoriesPanel={<CategoryList initialCategories={categoriesResult.data} />}
        brandsPanel={<BrandList initialBrands={brandsResult.data} />}
        unitsPanel={<UnitList initialUnits={unitsResult.data} />}
      />
    </div>
  );
}
