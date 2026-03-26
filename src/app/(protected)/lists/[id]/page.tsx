import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ListDetail } from "@/features/lists/components/list-detail";

export default async function ListDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: list } = await supabase
    .from("shopping_lists")
    .select("id, user_id, name, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!list) redirect("/lists");

  const { data: items } = await supabase
    .from("shopping_list_items")
    .select(
      `
      id,
      list_id,
      product_id,
      planned_quantity,
      created_at,
      products ( id, name, barcode )
    `
    )
    .eq("list_id", id)
    .order("created_at", { ascending: true });

  return (
    <ListDetail
      list={list}
      items={(items ?? []) as never[]}
    />
  );
}
