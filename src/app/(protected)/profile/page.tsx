import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getMyInvites } from "@/features/users/actions";
import { ProfilePage } from "@/features/users/components/profile-page";

export default async function ProfileRoute() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Check if user is admin/moderator to load invites
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdminOrMod = profile?.role === "admin" || profile?.role === "moderator";

  // Only fetch invites for admin/moderator
  const invitesResult = isAdminOrMod ? await getMyInvites() : { invites: [] };

  // Get emails of users who used invites (invited users)
  const usedInvites = invitesResult.invites.filter((i) => i.used_by);
  let invitedUsers: { id: string; email: string; created_at: string }[] = [];
  if (usedInvites.length > 0) {
    const userIds = usedInvites.map((i) => i.used_by!);
    const { data } = await supabase
      .from("profiles")
      .select("id, email, created_at")
      .in("id", userIds);
    invitedUsers = data ?? [];
  }

  return (
    <ProfilePage
      invites={isAdminOrMod ? invitesResult.invites : undefined}
      invitedUsers={invitedUsers}
    />
  );
}
