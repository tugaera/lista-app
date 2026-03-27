"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ExtractedReceipt } from "@/lib/ai";
import type { Store } from "@/features/stores/actions";
import { scanReceiptPhoto, importReceiptAsCart } from "@/features/history/actions-import";

type Step = "idle" | "scanning" | "review" | "importing";

type EditableItem = {
  id: number;
  selected: boolean;
  name: string;
  quantity: number;
  unit_price: number;
};

interface ImportReceiptModalProps {
  stores: Store[];
  onClose: () => void;
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/** Best-effort fuzzy match: find the store whose name most closely matches the AI-detected name */
function findBestStoreId(stores: Store[], aiStoreName: string | null): string {
  if (!aiStoreName || stores.length === 0) return "";
  const needle = aiStoreName.toLowerCase();
  const exact = stores.find((s) => s.name.toLowerCase() === needle);
  if (exact) return exact.id;
  const partial = stores.find(
    (s) => s.name.toLowerCase().includes(needle) || needle.includes(s.name.toLowerCase()),
  );
  return partial?.id ?? "";
}

export function ImportReceiptModal({ stores, onClose }: ImportReceiptModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Receipt metadata from AI
  const [storeId, setStoreId] = useState("");
  const [receiptDate, setReceiptDate] = useState("");
  const [receiptTotal, setReceiptTotal] = useState<number | null>(null);

  // Editable items
  const [items, setItems] = useState<EditableItem[]>([]);

  const selectedItems = items.filter((i) => i.selected);
  const selectedTotal = selectedItems.reduce(
    (sum, i) => sum + i.unit_price * i.quantity,
    0,
  );

  // ── File selection ───────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    setStep("scanning");

    const formData = new FormData();
    formData.set("receipt", file);

    const result = await scanReceiptPhoto(formData);

    if ("error" in result) {
      setError(result.error);
      setStep("idle");
      return;
    }

    const { data } = result as { data: ExtractedReceipt };
    setStoreId(findBestStoreId(stores, data.store_name));
    setReceiptTotal(data.grand_total);

    // Try to parse date into input[type=date] format (YYYY-MM-DD)
    if (data.date) {
      try {
        const d = new Date(data.date);
        if (!isNaN(d.getTime())) {
          setReceiptDate(d.toISOString().split("T")[0]);
        } else {
          setReceiptDate("");
        }
      } catch {
        setReceiptDate("");
      }
    }

    setItems(
      data.items.map((item, i) => ({
        id: i,
        selected: true,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
      })),
    );

    setStep("review");
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = "";
    },
    [handleFile],
  );

  // ── Item editing ─────────────────────────────────────────────────────────

  const updateItem = useCallback(
    (id: number, patch: Partial<EditableItem>) => {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addItem = useCallback(() => {
    setItems((prev) => [
      ...prev,
      { id: Date.now(), selected: true, name: "", quantity: 1, unit_price: 0 },
    ]);
  }, []);

  // ── Import ───────────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (selectedItems.length === 0) return;
    setStep("importing");

    if (!storeId) {
      setError("Please select a store before importing.");
      setStep("review");
      return;
    }

    const result = await importReceiptAsCart({
      items: selectedItems.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
      storeId,
      receiptDate: receiptDate || null,
      total: selectedTotal,
    });

    if ("error" in result) {
      setError(result.error);
      setStep("review");
      return;
    }

    router.push(`/history/${result.cartId}`);
    router.refresh();
    onClose();
  }, [selectedItems, storeId, receiptDate, selectedTotal, router, onClose]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">
            {step === "idle" && "Import from Receipt"}
            {step === "scanning" && "Reading receipt…"}
            {step === "review" && "Review & Import"}
            {step === "importing" && "Importing…"}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── IDLE ── */}
          {(step === "idle" || step === "scanning") && (
            <div className="p-6 flex flex-col items-center gap-4">
              {step === "scanning" && previewUrl ? (
                <div className="relative w-full max-w-xs">
                  <img src={previewUrl} alt="Receipt" className="w-full rounded-xl object-contain max-h-64" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/50">
                    <SpinnerIcon className="h-8 w-8 animate-spin text-white mb-2" />
                    <p className="text-sm font-medium text-white">Reading receipt with AI…</p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-12 text-gray-400 hover:border-emerald-300 hover:text-emerald-500 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="mb-3 h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-base font-medium">Take or upload a receipt photo</p>
                  <p className="mt-1 text-sm">AI will extract the items automatically</p>
                </button>
              )}

              {error && (
                <div className="w-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
              )}
            </div>
          )}

          {/* ── REVIEW ── */}
          {(step === "review" || step === "importing") && (
            <div className="p-4 space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Store <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    required
                    className={`w-full rounded-lg border px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none ${
                      !storeId ? "border-red-300 bg-red-50" : "border-gray-200"
                    }`}
                  >
                    <option value="">Select store…</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Select all / deselect all */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{selectedItems.length} of {items.length} items selected</span>
                <div className="flex gap-3 text-xs">
                  <button type="button" onClick={() => setItems((p) => p.map((i) => ({ ...i, selected: true })))} className="text-emerald-600 hover:underline">All</button>
                  <button type="button" onClick={() => setItems((p) => p.map((i) => ({ ...i, selected: false })))} className="text-gray-400 hover:underline">None</button>
                </div>
              </div>

              {/* Items table */}
              <div className="space-y-1.5">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                      item.selected ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"
                    }`}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(e) => updateItem(item.id, { selected: e.target.checked })}
                      className="h-4 w-4 shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />

                    {/* Name */}
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateItem(item.id, { name: e.target.value })}
                      placeholder="Product name"
                      className="min-w-0 flex-1 rounded border-0 bg-transparent text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded px-1 py-0.5"
                    />

                    {/* Qty */}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-gray-400">×</span>
                      <input
                        type="number"
                        value={item.quantity}
                        min={1}
                        step={1}
                        onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value)) })}
                        className="w-12 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-center text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    {/* Price */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <span className="text-xs text-gray-400">€</span>
                      <input
                        type="number"
                        value={item.unit_price}
                        min={0}
                        step={0.01}
                        onChange={(e) => updateItem(item.id, { unit_price: Math.max(0, Number(e.target.value)) })}
                        className="w-16 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-right text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    {/* Line total */}
                    <span className="w-14 shrink-0 text-right text-sm font-medium text-gray-700">
                      €{(item.unit_price * item.quantity).toFixed(2)}
                    </span>

                    {/* Remove */}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="shrink-0 text-gray-300 hover:text-red-400"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}

                {/* Add item */}
                <button
                  type="button"
                  onClick={addItem}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-400 hover:border-emerald-300 hover:text-emerald-500 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add item
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === "review" || step === "importing") && (
          <div className="border-t border-gray-100 px-4 py-3 shrink-0">
            {/* Totals */}
            <div className="mb-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Selected total</span>
                <span className="font-bold text-emerald-600">€{selectedTotal.toFixed(2)}</span>
              </div>
              {receiptTotal !== null && (
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Receipt total (reference)</span>
                  <span>€{receiptTotal.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={step === "importing"}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={selectedItems.length === 0 || !storeId || step === "importing"}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {step === "importing" ? (
                  <><SpinnerIcon className="h-4 w-4 animate-spin" /> Importing…</>
                ) : (
                  `Import ${selectedItems.length} item${selectedItems.length !== 1 ? "s" : ""}`
                )}
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>
    </div>
  );
}
