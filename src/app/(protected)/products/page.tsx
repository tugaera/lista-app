import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProductsPage } from "@/features/products/components/products-page";

export default async function ProductsRoute() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, created_at")
    .order("name");

  return <ProductsPage categories={categories ?? []} />;
}
