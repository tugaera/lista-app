import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ListsPage } from "@/features/lists/components/lists-page";
import { getSharedWithMeLists } from "@/features/lists/actions-shares";

export default async function ListsRoute() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Fetch own lists
  const { data: ownLists } = await supabase
    .from("shopping_lists")
    .select(
      `
      id,
      user_id,
      name,
      created_at,
      shopping_list_items ( id )
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Fetch shared-with-me lists (includes owner email)
  const sharedLists = await getSharedWithMeLists();

  const ownDisplayLists = (ownLists ?? []).map((list) => ({
    id: list.id,
    user_id: list.user_id,
    name: list.name,
    created_at: list.created_at,
    item_count: Array.isArray(list.shopping_list_items)
      ? list.shopping_list_items.length
      : 0,
    isOwner: true as const,
    ownerEmail: null as null,
  }));

  const sharedDisplayLists = sharedLists.map((s) => ({
    id: s.listId,
    user_id: "",
    name: s.listName,
    created_at: "",
    item_count: 0,
    isOwner: false as const,
    ownerEmail: s.ownerEmail,
  }));

  return (
    <ListsPage
      lists={[...ownDisplayLists, ...sharedDisplayLists]}
      userId={user.id}
    />
  );
}
