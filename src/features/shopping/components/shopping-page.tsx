"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CartItemDisplay } from "@/features/shopping/actions";
import { finalizeCart } from "@/features/shopping/actions";
import { CartItemList } from "./cart-item-list";
import { QuickAddForm } from "./quick-add-form";
import { BarcodeScanner } from "./barcode-scanner";

type ShoppingPageProps = {
  cartId: string;
  initialItems: CartItemDisplay[];
  stores: { id: string; name: string; is_active?: boolean }[];
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
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutStoreId, setCheckoutStoreId] = useState("");
  const [isCheckingOut, startCheckout] = useTransition();
  const [checkoutDone, setCheckoutDone] = useState<{ total: number } | null>(null);

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

  function handleCheckout() {
    setShowCheckout(false);
    startCheckout(async () => {
      try {
        const result = await finalizeCart(cartId, checkoutStoreId || undefined);
        setCheckoutDone(result);
      } catch {
        // Error finalizing
      }
    });
  }

  function handleNewCart() {
    setCheckoutDone(null);
    setItems([]);
    router.refresh();
  }

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);

  // Checkout success screen
  if (checkoutDone) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-gray-900">Shopping Complete!</h2>
          <p className="mb-1 text-3xl font-bold text-emerald-600">
            ${checkoutDone.total.toFixed(2)}
          </p>
          <p className="mb-6 text-sm text-gray-500">
            {items.length} {items.length === 1 ? "item" : "items"} saved to history
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleNewCart}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              New Shopping Trip
            </button>
            <button
              onClick={() => router.push("/history")}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View History
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Shopping</h1>
          <div className="flex items-center gap-3">
            {items.length > 0 && (
              <>
                <span className="text-sm font-medium text-gray-600">
                  ${total.toFixed(2)}
                </span>
                <button
                  onClick={() => setShowCheckout(true)}
                  disabled={isCheckingOut}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isCheckingOut ? "..." : "Checkout"}
                </button>
              </>
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

      {/* Checkout confirmation */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold text-gray-900">Finish shopping?</h3>
            <p className="mb-4 text-sm text-gray-500">
              {items.length} {items.length === 1 ? "item" : "items"} · total{" "}
              <span className="font-semibold text-emerald-600">${total.toFixed(2)}</span>
            </p>

            {/* Store selector */}
            <div className="mb-5">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Store <span className="text-gray-400">(optional)</span>
              </label>
              <select
                value={checkoutStoreId}
                onChange={(e) => setCheckoutStoreId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Select store…</option>
                {stores.filter((s) => s.is_active !== false).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowCheckout(false)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={isCheckingOut}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isCheckingOut ? "Saving…" : "Checkout"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
