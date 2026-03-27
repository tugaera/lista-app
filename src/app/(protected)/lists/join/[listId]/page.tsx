import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { JoinListConfirm } from "./join-list-confirm";

export default async function JoinListPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/auth/login?next=/lists/join/${listId}`);

  // Fetch list info
  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id, user_id, name")
    .eq("id", listId)
    .maybeSingle();

  if (!list) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-gray-600">This list is no longer available.</p>
          <a href="/lists" className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            Go to My Lists
          </a>
        </div>
      </div>
    );
  }

  // User already owns this list
  if (list.user_id === user.id) {
    redirect(`/lists/${listId}`);
  }

  // Get owner email
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", list.user_id)
    .maybeSingle();

  const ownerEmail = ownerProfile?.email ?? "someone";

  return (
    <JoinListConfirm
      listId={listId}
      listName={list.name}
      ownerEmail={ownerEmail}
    />
  );
}
