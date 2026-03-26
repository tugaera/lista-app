"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { CartItemDisplay } from "@/features/shopping/actions";
import { CartItemList } from "./cart-item-list";
import { QuickAddForm } from "./quick-add-form";
import { BarcodeScanner } from "./barcode-scanner";

type ShoppingPageProps = {
  cartId: string;
  initialItems: CartItemDisplay[];
  stores: { id: string; name: string }[];
};

export function ShoppingPage({
  cartId,
  initialItems,
  stores,
}: ShoppingPageProps) {
  const router = useRouter();
  const [items, setItems] = useState<CartItemDisplay[]>(initialItems);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | undefined>();

  const handleItemAdded = useCallback(
    (item: CartItemDisplay) => {
      setItems((prev) => [...prev, item]);
      setScannedBarcode(undefined);
      router.refresh();
    },
    [router],
  );

  const handleUpdate = useCallback(() => {
    router.refresh();
    // Re-fetch items via router refresh triggers server component re-render
    // For immediate feedback, we could also fetch client-side
  }, [router]);

  function handleBarcodeScan(barcode: string) {
    setScannedBarcode(barcode);
    setShowScanner(false);
  }

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Shopping</h1>
          <div className="flex items-center gap-3">
            {items.length > 0 && (
              <span className="text-sm font-medium text-gray-600">
                ${total.toFixed(2)}
              </span>
            )}
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>
        </div>
      </header>

      {/* Cart items */}
      <main className="mx-auto w-full max-w-lg flex-1 pb-60 lg:pb-40">
        <CartItemList items={items} cartId={cartId} onUpdate={handleUpdate} />
      </main>

      {/* Barcode scan button */}
      <button
        type="button"
        onClick={() => setShowScanner(true)}
        className="fixed right-4 top-16 z-30 rounded-full bg-blue-600 p-3 text-white shadow-lg transition-transform hover:scale-105 hover:bg-blue-700 active:scale-95"
        aria-label="Scan barcode"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
          />
        </svg>
      </button>

      {/* Scanned barcode indicator */}
      {scannedBarcode && (
        <div className="fixed bottom-44 left-4 right-4 z-50 mx-auto max-w-lg lg:bottom-28">
          <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <span>Barcode: {scannedBarcode}</span>
            <button
              type="button"
              onClick={() => setScannedBarcode(undefined)}
              className="ml-2 text-blue-500 hover:text-blue-700"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Quick-add form */}
      <QuickAddForm
        cartId={cartId}
        stores={stores}
        onItemAdded={handleItemAdded}
        scannedBarcode={scannedBarcode}
        onBarcodeClear={() => setScannedBarcode(undefined)}
      />

      {/* Barcode scanner modal */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
