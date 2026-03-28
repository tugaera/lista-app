import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { UserProvider } from "@/features/users/components/user-provider";
import type { Profile } from "@/types/database";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { SyncManager } from "@/components/sync-manager";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch profile
  let profile: Profile | null = null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (data) {
    profile = data;
  } else {
    // Profile doesn't exist yet (old user or trigger didn't fire)
    // Try to create one
    const { data: newProfile, error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email ?? "",
        role: "user" as const,
      })
      .select("*")
      .single();

    if (!insertError && newProfile) {
      profile = newProfile;
    } else {
      // If insert also fails, try fetching again (maybe trigger created it)
      const { data: retryProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      profile = retryProfile;
    }
  }

  // If we still have no profile, create a fallback in-memory
  // so the app doesn't redirect in a loop
  if (!profile) {
    profile = {
      id: user.id,
      email: user.email ?? "",
      role: "user",
      invited_by: null,
      created_at: new Date().toISOString(),
    };
  }

  return (
    <UserProvider profile={profile}>
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <main className="lg:ml-64 pb-20 lg:pb-0 min-h-screen">{children}</main>
        <BottomNav />
        <OfflineBanner />
        <SyncManager />
      </div>
    </UserProvider>
  );
}
