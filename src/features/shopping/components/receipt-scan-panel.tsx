"use client";

import { useRef, useState, useTransition } from "react";
import type { CartItemDisplay } from "@/features/shopping/actions";
import { updateCartItemPriceAndQty } from "@/features/shopping/actions";
import { extractReceiptFromFile } from "@/features/history/actions-receipts";
import type { ExtractedReceipt } from "@/lib/ai";

// ── Icons ──────────────────────────────────────────────────────────────────

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function matchCartItem(receiptName: string, cartItems: CartItemDisplay[]): CartItemDisplay | null {
  const needle = receiptName.toLowerCase().trim();
  // Exact match first
  let hit = cartItems.find((i) => i.productName.toLowerCase() === needle);
  if (hit) return hit;
  // Substring match
  hit = cartItems.find(
    (i) =>
      i.productName.toLowerCase().includes(needle) ||
      needle.includes(i.productName.toLowerCase()),
  );
  return hit ?? null;
}

// ── Comparison row types ───────────────────────────────────────────────────

type MatchRow = {
  receiptName: string;
  receiptQty: number;
  receiptUnitPrice: number;
  receiptTotal: number;
  cartItem: CartItemDisplay | null;
  priceMatch: boolean;
  qtyMatch: boolean;
};

// ── Component ──────────────────────────────────────────────────────────────

interface ReceiptScanPanelProps {
  cartId: string;
  cartItems: CartItemDisplay[];
  onItemsUpdated: (updates: Array<{ id: string; price: number; quantity: number }>) => void;
  onClose: () => void;
}

export function ReceiptScanPanel({ cartId, cartItems, onItemsUpdated, onClose }: ReceiptScanPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, startProcessing] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedReceipt | null>(null);

  // Editable overrides: cartItemId → { price, qty }
  const [edits, setEdits] = useState<Record<string, { price: string; qty: string }>>({});
  const [isApplying, startApplying] = useTransition();
  const [applyError, setApplyError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setExtractedData(null);
    setError(null);
    setEdits({});
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    e.target.value = "";
  }

  function handleAnalyze() {
    if (!selectedFile) return;
    setError(null);

    startProcessing(async () => {
      const formData = new FormData();
      formData.set("receipt", selectedFile);
      const result = await extractReceiptFromFile(formData);
      if ("error" in result) {
        setError(result.error);
      } else {
        setExtractedData(result.data);
        // Pre-fill edits for mismatches
        const initialEdits: Record<string, { price: string; qty: string }> = {};
        for (const item of result.data.items) {
          const cart = matchCartItem(item.name, cartItems);
          if (!cart) continue;
          const priceOk = Math.abs(cart.price - item.unit_price) < 0.01;
          const qtyOk = cart.quantity === item.quantity;
          if (!priceOk || !qtyOk) {
            initialEdits[cart.id] = {
              price: item.unit_price.toFixed(2),
              qty: String(item.quantity),
            };
          }
        }
        setEdits(initialEdits);
      }
    });
  }

  function handleApply() {
    setApplyError(null);
    const updates: Array<{ id: string; price: number; quantity: number }> = [];

    for (const [itemId, edit] of Object.entries(edits)) {
      const price = parseFloat(edit.price);
      const qty = parseInt(edit.qty, 10);
      if (isNaN(price) || price <= 0 || isNaN(qty) || qty <= 0) {
        setApplyError("Enter valid price and quantity for all items.");
        return;
      }
      updates.push({ id: itemId, price, quantity: qty });
    }

    if (updates.length === 0) {
      onClose();
      return;
    }

    startApplying(async () => {
      for (const upd of updates) {
        const result = await updateCartItemPriceAndQty(cartId, upd.id, upd.price, upd.quantity);
        if (result.error) {
          setApplyError(result.error);
          return;
        }
      }
      onItemsUpdated(updates);
      onClose();
    });
  }

  // Build comparison rows from extracted data
  const rows: MatchRow[] = extractedData
    ? extractedData.items.map((item) => {
        const cart = matchCartItem(item.name, cartItems);
        return {
          receiptName: item.name,
          receiptQty: item.quantity,
          receiptUnitPrice: item.unit_price,
          receiptTotal: item.total,
          cartItem: cart,
          priceMatch: cart ? Math.abs(cart.price - item.unit_price) < 0.01 : false,
          qtyMatch: cart ? cart.quantity === item.quantity : false,
        };
      })
    : [];

  const hasMismatches = rows.some((r) => r.cartItem && (!r.priceMatch || !r.qtyMatch));
  const cartTotal = cartItems.reduce((s, i) => s + i.subtotal, 0);
  const receiptTotal = extractedData?.grand_total ?? null;
  const totalDiff = receiptTotal !== null ? Math.abs(receiptTotal - cartTotal) : null;

  return (
    <div className="mx-4 mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-sm font-semibold text-amber-900">Scan Receipt</span>
        </div>
        <button type="button" onClick={onClose} className="text-amber-500 hover:text-amber-700">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Step 1: File upload */}
      {!extractedData && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          {previewUrl ? (
            <div className="mb-3">
              <img src={previewUrl} alt="Receipt preview" className="max-h-48 w-full rounded-lg object-contain bg-white" />
              <button
                type="button"
                onClick={() => { setPreviewUrl(null); setSelectedFile(null); setError(null); }}
                className="mt-1 text-xs text-amber-600 underline"
              >
                Change photo
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mb-3 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 py-6 text-amber-600 hover:border-amber-400 hover:text-amber-700 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="mb-1.5 h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-medium">Take photo or upload receipt</span>
            </button>
          )}

          {error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}

          {selectedFile && !isProcessing && (
            <button
              type="button"
              onClick={handleAnalyze}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Analyze with AI
            </button>
          )}

          {isProcessing && (
            <div className="flex items-center justify-center gap-2 py-2 text-sm text-amber-700">
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Analyzing receipt…
            </div>
          )}
        </>
      )}

      {/* Step 2: Comparison table */}
      {extractedData && (
        <>
          {/* Store + date from receipt */}
          {(extractedData.store_name || extractedData.date) && (
            <p className="mb-2 text-xs text-amber-700">
              {extractedData.store_name ?? ""}
              {extractedData.date ? ` · ${extractedData.date}` : ""}
            </p>
          )}

          {rows.length === 0 ? (
            <p className="mb-3 text-sm text-amber-700">No items could be extracted from this receipt.</p>
          ) : (
            <div className="mb-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-amber-200 text-left text-amber-600">
                    <th className="pb-1.5 font-medium">Item</th>
                    <th className="pb-1.5 text-right font-medium">Receipt</th>
                    <th className="pb-1.5 text-right font-medium">Cart</th>
                    <th className="pb-1.5 w-5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {rows.map((row, i) => {
                    const mismatch = row.cartItem && (!row.priceMatch || !row.qtyMatch);
                    const edit = row.cartItem ? edits[row.cartItem.id] : undefined;
                    return (
                      <tr key={i} className={mismatch ? "bg-red-50" : ""}>
                        <td className="py-1.5 pr-2 font-medium text-gray-900">
                          {row.receiptName}
                          {!row.cartItem && (
                            <span className="ml-1 text-[10px] text-gray-400">(not in cart)</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right text-gray-600 whitespace-nowrap">
                          {row.receiptQty}× €{row.receiptUnitPrice.toFixed(2)}
                        </td>
                        <td className="py-1.5 text-right whitespace-nowrap">
                          {row.cartItem ? (
                            mismatch && edit ? (
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={edit.qty}
                                  onChange={(e) =>
                                    setEdits((prev) => ({
                                      ...prev,
                                      [row.cartItem!.id]: { ...prev[row.cartItem!.id], qty: e.target.value },
                                    }))
                                  }
                                  className="w-10 rounded border border-red-300 px-1 py-0.5 text-right text-xs focus:border-red-500 focus:outline-none"
                                />
                                <span className="text-gray-500">×</span>
                                <span className="text-gray-500">€</span>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={edit.price}
                                  onChange={(e) =>
                                    setEdits((prev) => ({
                                      ...prev,
                                      [row.cartItem!.id]: { ...prev[row.cartItem!.id], price: e.target.value },
                                    }))
                                  }
                                  className="w-16 rounded border border-red-300 px-1 py-0.5 text-right text-xs focus:border-red-500 focus:outline-none"
                                />
                              </div>
                            ) : (
                              <span className="text-gray-600">
                                {row.cartItem.quantity}× €{row.cartItem.price.toFixed(2)}
                              </span>
                            )
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-1.5 pl-1 text-center">
                          {row.cartItem ? (
                            !row.priceMatch || !row.qtyMatch ? (
                              <span className="text-red-500">✗</span>
                            ) : (
                              <span className="text-emerald-500">✓</span>
                            )
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {receiptTotal !== null && (
                  <tfoot>
                    <tr className="border-t border-amber-200 font-semibold">
                      <td colSpan={2} className="pt-1.5 text-amber-900">Receipt total</td>
                      <td className="pt-1.5 text-right text-amber-900">€{receiptTotal.toFixed(2)}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={2} className="text-gray-500">Cart total</td>
                      <td className="text-right text-gray-500">€{cartTotal.toFixed(2)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {totalDiff !== null && totalDiff > 0.01 && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">
              Receipt total (€{receiptTotal!.toFixed(2)}) differs from cart total (€{cartTotal.toFixed(2)}) by €{totalDiff.toFixed(2)}.
            </p>
          )}

          {applyError && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600">{applyError}</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setExtractedData(null); setPreviewUrl(null); setSelectedFile(null); setError(null); setEdits({}); }}
              className="flex-1 rounded-lg border border-amber-300 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100"
            >
              Scan again
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isApplying || !hasMismatches}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isApplying ? (
                <span className="flex items-center justify-center gap-1.5">
                  <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                  Applying…
                </span>
              ) : hasMismatches ? (
                "Apply changes"
              ) : (
                "All prices match ✓"
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
