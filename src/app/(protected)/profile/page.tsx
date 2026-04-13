import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCachedUser, getCachedProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import { getMyInvites } from "@/features/users/actions";
import { ProfilePage } from "@/features/users/components/profile-page";

export default async function ProfileRoute() {
  const user = await getCachedUser();

  if (!user) redirect("/auth/login");

  // Use cached profile (already fetched in layout) instead of a separate DB query
  const profile = await getCachedProfile();
  const isAdminOrMod = profile?.role === "admin" || profile?.role === "moderator";

  // Only fetch invites for admin/moderator
  const invitesResult = isAdminOrMod ? await getMyInvites() : { invites: [] };

  // Get emails of users who used invites (invited users)
  const usedInvites = invitesResult.invites.filter((i) => i.used_by);
  let invitedUsers: { id: string; email: string; created_at: string }[] = [];
  if (usedInvites.length > 0) {
    const supabase = await createServerSupabaseClient();
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
