import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type BarcodeLookupResult =
  | { found: true; productId: string; name: string; quantity?: number; unitAbbreviation?: string }
  | { found: false; name: string; quantity?: number; unitAbbreviation?: string }
  | { found: false; name: null };

// Normalize Open Food Facts unit strings to our abbreviations
const UNIT_MAP: Record<string, string> = {
  g: "g", gr: "g", grams: "g", gram: "g",
  kg: "kg", kilograms: "kg", kilogram: "kg",
  ml: "ml", milliliters: "ml", millilitres: "ml",
  l: "L", lt: "L", liter: "L", litre: "L", liters: "L", litres: "L",
  cl: "cl", centiliters: "cl", centilitres: "cl",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  un: "un", unit: "un", units: "un", pcs: "un",
};

function parseProductQuantity(p: Record<string, unknown>): {
  quantity?: number;
  unitAbbreviation?: string;
} {
  // Preferred: product_quantity (numeric) + product_quantity_unit
  const pqRaw = p.product_quantity;
  const pqUnit = typeof p.product_quantity_unit === "string" ? p.product_quantity_unit.trim().toLowerCase() : "";

  if (pqRaw != null) {
    const pq = typeof pqRaw === "number" ? pqRaw : parseFloat(String(pqRaw));
    if (!isNaN(pq) && pq > 0) {
      const unit = UNIT_MAP[pqUnit] ?? undefined;
      return { quantity: pq, unitAbbreviation: unit };
    }
  }

  // Fallback: parse the "quantity" string (e.g., "200 g", "1.5 L", "6 x 330 ml")
  const qStr = typeof p.quantity === "string" ? p.quantity.trim() : "";
  if (qStr) {
    // Match patterns like "200 g", "1.5L", "500ml"
    const m = qStr.match(/^(\d+[.,]?\d*)\s*([a-zA-Z]+)/);
    if (m) {
      const num = parseFloat(m[1].replace(",", "."));
      const unitStr = m[2].toLowerCase();
      if (!isNaN(num) && num > 0) {
        return { quantity: num, unitAbbreviation: UNIT_MAP[unitStr] ?? undefined };
      }
    }
  }

  return {};
}

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

      // Extract quantity and unit
      const { quantity, unitAbbreviation } = parseProductQuantity(p);

      if (!name) return { found: false, name: null };
      return { found: false, name, quantity, unitAbbreviation };
    }
  } catch {
    // network error — fall through
  }

  return { found: false, name: null };
}
