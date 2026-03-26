import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUsers, getMyInvites } from "@/features/users/actions";
import { UserList } from "@/features/users/components/user-list";
import { InviteForm } from "@/features/users/components/invite-form";
import { InviteList } from "@/features/users/components/invite-list";

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [usersResult, invitesResult] = await Promise.all([
    getUsers(),
    getMyInvites(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Admin</h1>

      <div className="space-y-6">
        <InviteForm />
        <InviteList invites={invitesResult.invites} />
        <UserList users={usersResult.users} />
      </div>
    </div>
  );
}
