import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type BarcodeLookupResult =
  | { found: true; productId: string; name: string }   // exists in our DB
  | { found: false; name: string }                      // found on Open Food Facts, not in DB
  | { found: false; name: null };                       // not found anywhere

/**
 * Look up a barcode:
 * 1. Check our products table first.
 * 2. Fall back to Open Food Facts API.
 * Returns the best name we can find (Portuguese preferred).
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
  const supabase = createBrowserSupabaseClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, name")
    .eq("barcode", barcode)
    .eq("is_active", true)
    .maybeSingle();

  if (product) {
    return { found: true, productId: product.id, name: product.name };
  }

  // Not in our DB — try Open Food Facts
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
    );
    const json = await res.json();
    if (json.status === 1 && json.product) {
      const p = json.product;
      const name: string =
        p.product_name_pt ||
        p.generic_name_pt ||
        p.product_name ||
        p.generic_name ||
        "";
      return { found: false, name: name || null };
    }
  } catch {
    // network error — fall through
  }

  return { found: false, name: null };
}
