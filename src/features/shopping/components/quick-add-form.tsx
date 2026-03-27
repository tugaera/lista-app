"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addCartItem } from "@/features/shopping/actions";
import type { CartItemDisplay } from "@/features/shopping/actions";
import { ProductSearch, type ProductResult } from "./product-search";
import { DiscountModal } from "./discount-modal";

type QuickAddFormProps = {
  cartId: string;
  storeId: string;
  onItemAdded: (item: CartItemDisplay) => void;
  scannedBarcode?: string;
  onBarcodeClear?: () => void;
  onScanRequest?: () => void;
};

export function QuickAddForm({
  cartId,
  storeId,
  onItemAdded,
  scannedBarcode,
  onBarcodeClear,
  onScanRequest,
}: QuickAddFormProps) {
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");            // final price (what you pay)
  const [originalPrice, setOriginalPrice] = useState<number | null>(null); // pre-discount
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [barcode, setBarcode] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [barcodeStatus, setBarcodeStatus] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastScannedRef = useRef<string | undefined>(undefined);

  const hasDiscount = originalPrice !== null && originalPrice > parseFloat(price);
  const discountPct = hasDiscount
    ? Math.round((1 - parseFloat(price) / originalPrice!) * 100)
    : 0;

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
      setOriginalPrice(null);
    }
    setTimeout(() => {
      const priceInput = formRef.current?.querySelector<HTMLInputElement>('input[placeholder="Price"]');
      priceInput?.focus();
    }, 50);
  }

  function handleDiscountApply(result: { originalPrice: number; finalPrice: number }) {
    setOriginalPrice(result.originalPrice);
    setPrice(result.finalPrice.toFixed(2));
    setShowDiscountModal(false);
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
          originalPrice: hasDiscount ? originalPrice : null,
          quantity: parsedQuantity,
          storeId,
          barcode,
        });
        onItemAdded(item);
        setProductName("");
        setPrice("");
        setOriginalPrice(null);
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
    <>
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
            {onScanRequest && (
              <button
                type="button"
                onClick={onScanRequest}
                aria-label="Scan barcode"
                className="flex-shrink-0 rounded-lg border border-gray-300 px-2.5 py-2 text-gray-600 hover:bg-gray-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </button>
            )}

            {/* Price — shows discount badge if active */}
            <div className="relative w-24 flex-shrink-0">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  // Clear discount if price changes manually
                  setOriginalPrice(null);
                }}
                placeholder="Price"
                disabled={disabled}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-400 ${
                  hasDiscount
                    ? "border-orange-300 bg-orange-50 text-orange-700 focus:border-orange-400 focus:ring-orange-400"
                    : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                }`}
              />
              {hasDiscount && (
                <span className="pointer-events-none absolute -top-2 right-1 rounded-full bg-orange-500 px-1 py-0 text-[10px] font-bold leading-tight text-white">
                  −{discountPct}%
                </span>
              )}
            </div>

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

            {/* Discount toggle */}
            <button
              type="button"
              onClick={() => setShowDiscountModal(true)}
              disabled={disabled}
              title={hasDiscount ? "Edit discount" : "Add discount"}
              className={`flex-shrink-0 rounded-lg border px-2.5 py-2 text-sm transition-colors disabled:opacity-40 ${
                hasDiscount
                  ? "border-orange-300 bg-orange-50 text-orange-600"
                  : "border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M17 17h.01M7 17L17 7M7 7a2 2 0 100-4 2 2 0 000 4zm10 10a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </button>

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

      {showDiscountModal && (
        <DiscountModal
          initialPrice={originalPrice !== null ? originalPrice : (parseFloat(price) || undefined)}
          initialFinalPrice={originalPrice !== null ? (parseFloat(price) || undefined) : undefined}
          onConfirm={handleDiscountApply}
          onClose={() => setShowDiscountModal(false)}
        />
      )}
    </>
  );
}
