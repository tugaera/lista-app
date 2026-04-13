import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCachedUser, getCachedProfile } from "@/lib/supabase/cached";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { UserProvider } from "@/features/users/components/user-provider";
import { I18nProvider } from "@/i18n/i18n-provider";
import type { Locale } from "@/i18n";
import type { Profile } from "@/types/database";
import { OfflineBanner } from "@/components/ui/offline-banner";
import { SyncManager } from "@/components/sync-manager";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCachedUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fast path: cached profile (runs once per request even if pages also call it)
  let profile: Profile | null = await getCachedProfile();

  // Slow path: profile doesn't exist yet (old user or trigger didn't fire)
  // This runs only on first-ever visit — not on every page load
  if (!profile) {
    const supabase = await createServerSupabaseClient();
    const { data: newProfile, error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email ?? "",
        role: "user" as const,
      })
      .select("id, email, role, language, invited_by, created_at")
      .single();

    if (!insertError && newProfile) {
      profile = newProfile;
    } else {
      // If insert also fails, try fetching again (maybe trigger created it)
      const { data: retryProfile } = await supabase
        .from("profiles")
        .select("id, email, role, language, invited_by, created_at")
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
      language: "pt",
      created_at: new Date().toISOString(),
    };
  }

  const userLocale = (profile.language === "en" || profile.language === "pt" ? profile.language : "pt") as Locale;

  return (
    <UserProvider profile={profile}>
      <I18nProvider initialLocale={userLocale}>
        <div className="min-h-screen bg-gray-50">
          <Sidebar />
          <main className="lg:ml-64 pb-20 lg:pb-0 min-h-screen">{children}</main>
          <BottomNav />
          <OfflineBanner />
          <SyncManager />
          <PullToRefresh />
        </div>
      </I18nProvider>
    </UserProvider>
  );
}
