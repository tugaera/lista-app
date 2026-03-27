"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addCartItem } from "@/features/shopping/actions";
import type { CartItemDisplay } from "@/features/shopping/actions";
import { ProductSearch, type ProductResult } from "./product-search";

type QuickAddFormProps = {
  cartId: string;
  storeId: string;        // store belongs to the cart, not per-product
  onItemAdded: (item: CartItemDisplay) => void;
  scannedBarcode?: string;
  onBarcodeClear?: () => void;
};

export function QuickAddForm({
  cartId,
  storeId,
  onItemAdded,
  scannedBarcode,
  onBarcodeClear,
}: QuickAddFormProps) {
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
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

    async function doLookup() {
      try {
        const { lookupBarcode } = await import("@/lib/barcode-lookup");
        const result = await lookupBarcode(scannedBarcode!);

        if (result.found) {
          setProductName(result.name);
          // Also fetch last price for this product
          const { createBrowserSupabaseClient } = await import("@/lib/supabase/client");
          const supabase = createBrowserSupabaseClient();
          const { data: entry } = await supabase
            .from("product_entries")
            .select("price")
            .eq("product_id", result.productId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
          if (entry) setPrice(entry.price.toFixed(2));
          setBarcodeStatus(`Found: ${result.name}`);
        } else if (result.name) {
          setProductName(result.name);
          setBarcodeStatus(`Found: ${result.name}`);
        } else {
          setBarcodeStatus("Product not found — type name below");
        }
      } catch {
        setBarcodeStatus("Error looking up barcode — type name below");
      }
    }

    doLookup();
  }, [scannedBarcode]);

  function handleProductSelect(product: ProductResult) {
    setProductName(product.name);
    if (product.lastPrice != null) {
      setPrice(product.lastPrice.toFixed(2));
    }
    setTimeout(() => {
      const priceInput = formRef.current?.querySelector<HTMLInputElement>('input[placeholder="Price"]');
      priceInput?.focus();
    }, 50);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!storeId) {
      setError("Select a store in the header first");
      return;
    }

    const parsedPrice = parseFloat(price);
    const parsedQuantity = parseFloat(quantity);

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
        setError(err instanceof Error ? err.message : "Failed to add item");
      }
    });
  }

  const disabled = !storeId;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-safe lg:bottom-0">
      <form ref={formRef} onSubmit={handleSubmit} className="mx-auto max-w-lg px-4 py-3">
        {barcodeStatus && (
          <p className="mb-2 text-xs font-medium text-emerald-600">{barcodeStatus}</p>
        )}
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        {disabled && (
          <p className="mb-2 text-xs text-amber-600">⚠ Select a store above to start adding items</p>
        )}
        <div className="mb-2">
          <ProductSearch
            onSelect={handleProductSelect}
            placeholder="Product name (search or type new)"
            value={productName}
            onValueChange={setProductName}
            disabled={disabled}
            storeId={storeId}
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
            disabled={disabled}
            className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <input
            type="number"
            inputMode="decimal"
            step="0.001"
            min="0.001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Qty"
            disabled={disabled}
            className="w-16 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            type="submit"
            disabled={isPending || disabled}
            className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "..." : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
