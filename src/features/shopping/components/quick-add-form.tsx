"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addCartItem } from "@/features/shopping/actions";
import type { CartItemDisplay } from "@/features/shopping/actions";
import { ProductSearch, type ProductResult } from "./product-search";

type QuickAddFormProps = {
  cartId: string;
  stores: { id: string; name: string }[];
  onItemAdded: (item: CartItemDisplay) => void;
  scannedBarcode?: string;
  onBarcodeClear?: () => void;
};

export function QuickAddForm({
  cartId,
  stores,
  onItemAdded,
  scannedBarcode,
  onBarcodeClear,
}: QuickAddFormProps) {
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [barcode, setBarcode] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [barcodeStatus, setBarcodeStatus] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastScannedRef = useRef<string | undefined>(undefined);

  // When a barcode is scanned, look up the product
  useEffect(() => {
    if (!scannedBarcode || scannedBarcode === lastScannedRef.current) return;
    lastScannedRef.current = scannedBarcode;
    setBarcode(scannedBarcode);
    setBarcodeStatus("Looking up barcode...");

    async function lookupBarcode() {
      try {
        const { createBrowserSupabaseClient } = await import("@/lib/supabase/client");
        const supabase = createBrowserSupabaseClient();

        // Look up product by barcode
        const { data: product } = await supabase
          .from("products")
          .select("id, name")
          .eq("barcode", scannedBarcode!)
          .single();

        if (product) {
          setProductName(product.name);

          // Get latest price
          const { data: entry } = await supabase
            .from("product_entries")
            .select("price, store_id")
            .eq("product_id", product.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (entry) {
            setPrice(entry.price.toFixed(2));
            if (entry.store_id) setStoreId(entry.store_id);
          }

          setBarcodeStatus(`Found: ${product.name}`);
        } else {
          // Not in our DB — try Open Food Facts API
          setBarcodeStatus("Searching Open Food Facts...");
          try {
            const res = await fetch(
              `https://world.openfoodfacts.org/api/v0/product/${scannedBarcode}.json`,
            );
            const json = await res.json();

            if (json.status === 1 && json.product) {
              const p = json.product;
              const name =
                p.product_name_pt ||
                p.generic_name_pt ||
                p.product_name ||
                p.generic_name ||
                "";

              if (name) {
                setProductName(name);
                setBarcodeStatus(`Found: ${name}`);
              } else {
                setBarcodeStatus("Product found but no name — type it below");
              }
            } else {
              setBarcodeStatus("Product not found — type name below");
            }
          } catch {
            setBarcodeStatus("Could not search online — type name below");
          }
        }
      } catch {
        setBarcodeStatus("Error looking up barcode — type name below");
      }
    }

    lookupBarcode();
  }, [scannedBarcode]);

  function handleProductSelect(product: ProductResult) {
    setProductName(product.name);
    if (product.lastPrice != null) {
      setPrice(product.lastPrice.toFixed(2));
    }
    // Focus price input after selection
    setTimeout(() => {
      const priceInput = formRef.current?.querySelector<HTMLInputElement>('input[placeholder="Price"]');
      priceInput?.focus();
    }, 50);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedPrice = parseFloat(price);
    const parsedQuantity = parseInt(quantity, 10);

    if (!productName.trim()) {
      setError("Product name is required");
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setError("Enter a valid price");
      return;
    }
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      setError("Enter a valid quantity");
      return;
    }
    if (!storeId) {
      setError("Select a store");
      return;
    }

    startTransition(async () => {
      try {
        const item = await addCartItem(cartId, {
          productName: productName.trim(),
          price: parsedPrice,
          quantity: parsedQuantity,
          storeId,
          barcode,
        });
        onItemAdded(item);
        setProductName("");
        setPrice("");
        setQuantity("1");
        setBarcode(undefined);
        setBarcodeStatus(null);
        lastScannedRef.current = undefined;
        onBarcodeClear?.();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to add item",
        );
      }
    });
  }

  return (
    <div className="fixed bottom-16 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-safe lg:bottom-0">
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="mx-auto max-w-lg px-4 py-3"
      >
        {barcodeStatus && (
          <p className="mb-2 text-xs font-medium text-emerald-600">{barcodeStatus}</p>
        )}
        {error && (
          <p className="mb-2 text-xs text-red-600">{error}</p>
        )}
        <div className="mb-2">
          <ProductSearch
            onSelect={handleProductSelect}
            placeholder="Product name (search or type new)"
            value={productName}
            onValueChange={setProductName}
          />
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price"
            className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Qty"
            className="w-16 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isPending}
            className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "..." : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
