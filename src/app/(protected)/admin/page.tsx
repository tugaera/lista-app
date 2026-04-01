import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUsers } from "@/features/users/actions";
import { getStores } from "@/features/stores/actions";
import { UserList } from "@/features/users/components/user-list";
import { StoreList } from "@/features/stores/components/store-list";
import { AdminTabs } from "./admin-tabs";

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const [usersResult, storesResult] = await Promise.all([
    getUsers(),
    getStores(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <AdminTabs
        usersPanel={<UserList users={usersResult.users} />}
        storesPanel={<StoreList initialStores={storesResult.stores} />}
      />
    </div>
  );
}
