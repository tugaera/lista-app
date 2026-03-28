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

  // Don't query the list directly — RLS blocks it since the user isn't a member yet.
  // The JoinListConfirm component calls the security definer RPC which handles everything.
  return <JoinListConfirm listId={listId} />;
}
