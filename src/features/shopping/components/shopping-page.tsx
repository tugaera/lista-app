"use client";

import { useCallback, useState } from "react";
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
  const [items, setItems] = useState<CartItemDisplay[]>(initialItems);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | undefined>();

  const handleItemAdded = useCallback(
    (item: CartItemDisplay) => {
      setItems((prev) => {
        // If merged, replace existing item with updated quantity
        if (item.merged) {
          const exists = prev.find((i) => i.id === item.id);
          if (exists) {
            return prev.map((i) => (i.id === item.id ? { ...item } : i));
          }
        }
        return [...prev, item];
      });
      setScannedBarcode(undefined);
    },
    [],
  );

  const handleItemRemoved = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  const handleItemUpdated = useCallback((itemId: string, newQuantity: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? { ...i, quantity: newQuantity, subtotal: i.price * newQuantity }
          : i,
      ),
    );
  }, []);

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
        <CartItemList
          items={items}
          cartId={cartId}
          onItemRemoved={handleItemRemoved}
          onItemUpdated={handleItemUpdated}
        />
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

      {/* Scanned barcode toast — top right */}
      {scannedBarcode && (
        <div className="fixed right-4 top-28 z-50 animate-in fade-in slide-in-from-right">
          <div className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>{scannedBarcode}</span>
            <button
              type="button"
              onClick={() => setScannedBarcode(undefined)}
              className="ml-1 rounded p-0.5 hover:bg-white/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
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
