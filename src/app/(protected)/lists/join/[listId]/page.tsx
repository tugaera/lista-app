import { redirect } from "next/navigation";
import { getCachedUser } from "@/lib/supabase/cached";
import { JoinListConfirm } from "./join-list-confirm";

export default async function JoinListPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const user = await getCachedUser();

  if (!user) redirect(`/auth/login?next=/lists/join/${listId}`);

  // Don't query the list directly — RLS blocks it since the user isn't a member yet.
  // The JoinListConfirm component calls the security definer RPC which handles everything.
  return <JoinListConfirm listId={listId} />;
}
