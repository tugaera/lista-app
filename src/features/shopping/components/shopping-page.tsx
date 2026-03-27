"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CartItemDisplay } from "@/features/shopping/actions";
import { finalizeCart, updateCartStore } from "@/features/shopping/actions";
import { getListWithItems } from "@/features/lists/actions";
import { CartItemList } from "./cart-item-list";
import { QuickAddForm } from "./quick-add-form";
import { BarcodeScanner } from "./barcode-scanner";
import { ListTrackingPanel, type TrackingItem } from "./list-tracking-panel";

type Store = { id: string; name: string; is_active?: boolean };
type ListPreview = { id: string; name: string; item_count: number };

type ShoppingPageProps = {
  cartId: string;
  initialStoreId: string | null;
  initialItems: CartItemDisplay[];
  stores: Store[];
  lists: ListPreview[];
  initialTrackingList: { id: string; name: string; items: TrackingItem[] } | null;
};

export function ShoppingPage({
  cartId,
  initialStoreId,
  initialItems,
  stores,
  lists,
  initialTrackingList,
}: ShoppingPageProps) {
  const router = useRouter();
  const [items, setItems] = useState<CartItemDisplay[]>(initialItems);
  const [storeId, setStoreId] = useState<string>(initialStoreId ?? "");
  const [showScanner, setShowScanner] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | undefined>();
  const [showCheckout, setShowCheckout] = useState(false);
  const [isCheckingOut, startCheckout] = useTransition();
  const [checkoutDone, setCheckoutDone] = useState<{ total: number; storeName?: string } | null>(null);

  // List tracking
  const [trackingList, setTrackingList] = useState<{ id: string; name: string; items: TrackingItem[] } | null>(
    initialTrackingList,
  );
  const [showListPicker, setShowListPicker] = useState(false);
  const [loadingList, setLoadingList] = useState(false);

  const handleItemAdded = useCallback((item: CartItemDisplay) => {
    setItems((prev) => {
      if (item.merged) {
        const exists = prev.find((i) => i.id === item.id);
        if (exists) return prev.map((i) => (i.id === item.id ? { ...item } : i));
      }
      return [...prev, item];
    });
    setScannedBarcode(undefined);
  }, []);

  const handleItemRemoved = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  const handleItemUpdated = useCallback((itemId: string, newQuantity: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, quantity: newQuantity, subtotal: i.price * newQuantity } : i,
      ),
    );
  }, []);

  async function handleStoreChange(newStoreId: string) {
    setStoreId(newStoreId);
    await updateCartStore(cartId, newStoreId || null);
  }

  function handleBarcodeScan(barcode: string) {
    setScannedBarcode(barcode);
    setShowScanner(false);
  }

  async function handleSelectList(listId: string) {
    setShowListPicker(false);
    if (!listId) { setTrackingList(null); return; }
    setLoadingList(true);
    const { list, items: listItems } = await getListWithItems(listId);
    if (list) {
      setTrackingList({
        id: list.id,
        name: list.name,
        items: listItems.map((i) => ({
          id: i.id,
          productId: i.product_id ?? null,
          name: (i.products as unknown as { name: string } | null)?.name ?? "Unknown",
          plannedQty: i.planned_quantity,
        })),
      });
    }
    setLoadingList(false);
  }

  function handleCheckout() {
    setShowCheckout(false);
    const storeName = stores.find((s) => s.id === storeId)?.name;
    startCheckout(async () => {
      try {
        const result = await finalizeCart(cartId);
        setCheckoutDone({ ...result, storeName });
      } catch {
        // Error finalizing
      }
    });
  }

  function handleNewCart() {
    setCheckoutDone(null);
    setItems([]);
    setTrackingList(null);
    router.refresh();
  }

  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const selectedStore = stores.find((s) => s.id === storeId);

  // ── Checkout success screen ───────────────────────────────────────────────
  if (checkoutDone) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mb-1 text-xl font-bold text-gray-900">Shopping Complete!</h2>
          {checkoutDone.storeName && (
            <p className="mb-2 text-sm font-medium text-emerald-600">{checkoutDone.storeName}</p>
          )}
          <p className="mb-1 text-3xl font-bold text-gray-900">€{checkoutDone.total.toFixed(2)}</p>
          <p className="mb-6 text-sm text-gray-500">
            {items.length} {items.length === 1 ? "item" : "items"} saved to history
          </p>
          <div className="flex flex-col gap-3">
            <button onClick={handleNewCart} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700">
              New Shopping Trip
            </button>
            <button onClick={() => router.push("/history")} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              View History
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main shopping view ────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          {/* Store selector */}
          <select
            value={storeId}
            onChange={(e) => handleStoreChange(e.target.value)}
            className={`min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
              storeId
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 focus:border-emerald-400"
                : "border-amber-200 bg-amber-50 text-amber-700 focus:border-amber-400"
            }`}
          >
            <option value="">Select store…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Track list button */}
          <button
            type="button"
            onClick={() => setShowListPicker(true)}
            title="Track a shopping list"
            className={`shrink-0 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
              trackingList
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            {loadingList ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            )}
          </button>

          {/* Total + checkout */}
          {items.length > 0 && (
            <>
              <span className="shrink-0 text-sm font-semibold text-gray-700">
                €{total.toFixed(2)}
              </span>
              <button
                onClick={() => setShowCheckout(true)}
                disabled={isCheckingOut}
                className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {isCheckingOut ? "…" : "Checkout"}
              </button>
            </>
          )}

          {/* Item count */}
          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {items.length}
          </span>
        </div>
      </header>

      {/* List tracking panel — sticky below header */}
      {trackingList && (
        <div className="sticky top-[57px] z-20">
          <ListTrackingPanel
            listName={trackingList.name}
            items={trackingList.items}
            cartItems={items}
            onClose={() => setTrackingList(null)}
          />
        </div>
      )}

      {/* Cart items */}
      <main className="mx-auto w-full max-w-lg flex-1 pb-60 lg:pb-40">
        <CartItemList
          items={items}
          cartId={cartId}
          onItemRemoved={handleItemRemoved}
          onItemUpdated={handleItemUpdated}
        />
      </main>

      {/* Scanned barcode toast */}
      {scannedBarcode && (
        <div className="fixed right-4 top-28 z-50 animate-in fade-in slide-in-from-right">
          <div className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>{scannedBarcode}</span>
            <button type="button" onClick={() => setScannedBarcode(undefined)} className="ml-1 rounded p-0.5 hover:bg-white/20">
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
        storeId={storeId}
        onItemAdded={handleItemAdded}
        scannedBarcode={scannedBarcode}
        onBarcodeClear={() => setScannedBarcode(undefined)}
        onScanRequest={() => setShowScanner(true)}
      />

      {/* Barcode scanner modal */}
      {showScanner && (
        <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setShowScanner(false)} />
      )}

      {/* List picker modal */}
      {showListPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowListPicker(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">Track a Shopping List</h3>
              <button type="button" onClick={() => setShowListPicker(false)} className="rounded p-1 text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ul className="max-h-72 overflow-y-auto p-2">
              {trackingList && (
                <li>
                  <button
                    type="button"
                    onClick={() => { setTrackingList(null); setShowListPicker(false); }}
                    className="flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Stop tracking
                  </button>
                </li>
              )}
              {lists.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-gray-400">No shopping lists yet.</li>
              )}
              {lists.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectList(l.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-sm hover:bg-gray-50 ${
                      trackingList?.id === l.id ? "bg-blue-50 font-semibold text-blue-700" : "text-gray-800"
                    }`}
                  >
                    <span>{l.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-gray-400">{l.item_count} items</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Checkout confirmation */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold text-gray-900">Finish shopping?</h3>
            <p className="mb-1 text-sm text-gray-500">
              {items.length} {items.length === 1 ? "item" : "items"} ·{" "}
              <span className="font-semibold text-gray-700">€{total.toFixed(2)}</span>
            </p>
            {selectedStore && (
              <p className="mb-4 text-sm font-medium text-emerald-600">{selectedStore.name}</p>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowCheckout(false)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={handleCheckout} disabled={isCheckingOut} className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                {isCheckingOut ? "Saving…" : "Checkout"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
