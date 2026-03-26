import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ListsPage } from "@/features/lists/components/lists-page";

export default async function ListsRoute() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: lists } = await supabase
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

  const displayLists = (lists ?? []).map((list) => ({
    ...list,
    item_count: Array.isArray(list.shopping_list_items)
      ? list.shopping_list_items.length
      : 0,
  }));

  return <ListsPage lists={displayLists as never[]} />;
}
