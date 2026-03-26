import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUsers, getMyInvites } from "@/features/users/actions";
import { getStores } from "@/features/stores/actions";
import { UserList } from "@/features/users/components/user-list";
import { InviteForm } from "@/features/users/components/invite-form";
import { InviteList } from "@/features/users/components/invite-list";
import { StoreList } from "@/features/stores/components/store-list";
import { AdminProductsPanel } from "@/features/products/components/admin-products-panel";
import { AdminTabs } from "./admin-tabs";

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const [usersResult, invitesResult, storesResult, categoriesResult] = await Promise.all([
    getUsers(),
    getMyInvites(),
    getStores(),
    supabase.from("categories").select("id, name, created_at").order("name"),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Admin</h1>

      <AdminTabs
        usersPanel={
          <>
            <InviteForm />
            <InviteList invites={invitesResult.invites} />
            <UserList users={usersResult.users} />
          </>
        }
        storesPanel={<StoreList initialStores={storesResult.stores} />}
        productsPanel={
          <AdminProductsPanel categories={categoriesResult.data ?? []} />
        }
      />
    </div>
  );
}
