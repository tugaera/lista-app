import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { UserProvider } from "@/features/users/components/user-provider";
import type { Profile } from "@/types/database";

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

  // Fetch or create profile
  let profile: Profile | null = null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (data) {
    profile = data;
  } else {
    // Profile may not exist yet (trigger didn't fire, or old user)
    // Create a default profile
    const { data: newProfile } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email ?? "",
        role: "user",
      })
      .select("*")
      .single();
    profile = newProfile;
  }

  if (!profile) {
    redirect("/auth/login");
  }

  return (
    <UserProvider profile={profile}>
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <main className="lg:ml-64 pb-20 lg:pb-0 min-h-screen">{children}</main>
        <BottomNav />
      </div>
    </UserProvider>
  );
}
