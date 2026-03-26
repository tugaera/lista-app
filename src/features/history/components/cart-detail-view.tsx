"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ShoppingCart } from "@/types/database";
import type { ReceiptImageWithUrl } from "@/features/history/actions-receipts";
import type { ExtractedReceipt } from "@/lib/ai";
import {
  uploadCartReceiptImage,
  deleteCartReceiptImage,
  extractReceiptItems,
} from "@/features/history/actions-receipts";

interface CartItem {
  id: string;
  cart_id: string;
  product_entry_id: string;
  quantity: number;
  created_at: string;
  product_entries: {
    id: string;
    price: number;
    quantity: number;
    product_id: string;
    store_id: string;
    products: { name: string } | null;
    stores: { name: string } | null;
  } | null;
}

interface CartDetailViewProps {
  cart: ShoppingCart;
  items: CartItem[];
  receiptImages: ReceiptImageWithUrl[];
}

// ── Icons ──────────────────────────────────────────────────────────────────

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3l1.5 4L10 8.5 6.5 10 5 14l-1.5-4L0 8.5 3.5 7 5 3zM19 13l1 2.5L22.5 17 20 18l-1 2.5-1-2.5L15.5 17 18 15.5 19 13z" />
    </svg>
  );
}

// ── Extracted Receipt Panel ────────────────────────────────────────────────

function ExtractedReceiptPanel({
  data,
  cartTotal,
  onClose,
}: {
  data: ExtractedReceipt;
  cartTotal: number;
  onClose: () => void;
}) {
  const diff = data.grand_total !== null ? Math.abs(data.grand_total - cartTotal) : null;
  const hasDiff = diff !== null && diff > 0.01;

  return (
    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-900">
            {data.store_name ?? "Receipt"} — Scanned Items
          </p>
          {data.date && (
            <p className="text-xs text-blue-600">{data.date}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-blue-400 hover:text-blue-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {data.items.length === 0 ? (
        <p className="text-sm text-blue-700">No items could be extracted from this receipt.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-blue-200 text-left text-blue-600">
                <th className="pb-1.5 font-medium">Product</th>
                <th className="pb-1.5 text-right font-medium">Qty</th>
                <th className="pb-1.5 text-right font-medium">Unit</th>
                <th className="pb-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-100">
              {data.items.map((item, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2 text-blue-900">{item.name}</td>
                  <td className="py-1 text-right text-blue-700">{item.quantity}</td>
                  <td className="py-1 text-right text-blue-700">€{item.unit_price.toFixed(2)}</td>
                  <td className="py-1 text-right font-medium text-blue-900">€{item.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            {data.grand_total !== null && (
              <tfoot>
                <tr className="border-t border-blue-200">
                  <td colSpan={3} className="pt-1.5 font-semibold text-blue-900">Total</td>
                  <td className="pt-1.5 text-right font-bold text-blue-900">€{data.grand_total.toFixed(2)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {hasDiff && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
          Receipt total (€{data.grand_total!.toFixed(2)}) differs from cart total (€{cartTotal.toFixed(2)}) by €{diff!.toFixed(2)}.
        </p>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function CartDetailView({
  cart,
  items,
  receiptImages: initialImages,
}: CartDetailViewProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ReceiptImageWithUrl[]>(initialImages);
  const [isUploading, startUpload] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  // Scan state: imageId → { loading | data | error }
  const [scanState, setScanState] = useState<
    Record<string, { loading: boolean; data?: ExtractedReceipt; error?: string }>
  >({});

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      setUploadError(null);

      startUpload(async () => {
        for (let i = 0; i < files.length; i++) {
          const formData = new FormData();
          formData.set("receipt", files[i]);
          const result = await uploadCartReceiptImage(cart.id, formData);
          if ("error" in result) {
            setUploadError(result.error);
            break;
          }
          setImages((prev) => [
            ...prev,
            {
              id: result.id,
              cart_id: cart.id,
              image_path: "",
              signed_url: result.signed_url,
              sort_order: prev.length,
              created_at: new Date().toISOString(),
            },
          ]);
        }
      });
      e.target.value = "";
    },
    [cart.id],
  );

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    const targetId = deleteTarget;
    setDeleteTarget(null);
    startDelete(async () => {
      const result = await deleteCartReceiptImage(targetId);
      if (result.success) {
        setImages((prev) => prev.filter((img) => img.id !== targetId));
        setScanState((prev) => {
          const next = { ...prev };
          delete next[targetId];
          return next;
        });
      }
    });
  }, [deleteTarget]);

  const handleScan = useCallback(async (imageId: string) => {
    setScanState((prev) => ({ ...prev, [imageId]: { loading: true } }));
    const result = await extractReceiptItems(imageId);
    if ("error" in result) {
      setScanState((prev) => ({ ...prev, [imageId]: { loading: false, error: result.error } }));
    } else {
      setScanState((prev) => ({ ...prev, [imageId]: { loading: false, data: result.data } }));
    }
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button
        onClick={() => router.push("/history")}
        className="mb-2 text-sm text-emerald-600 hover:text-emerald-700"
      >
        &larr; Back to history
      </button>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {new Date(cart.finalized_at ?? cart.created_at).toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </h1>
      </div>

      {/* Receipt images section */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Receipt Photos
            {images.length > 0 && (
              <span className="ml-1.5 text-xs font-normal text-gray-400">({images.length})</span>
            )}
          </h2>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {isUploading ? (
              <><SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> Uploading...</>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Add Photo
              </>
            )}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" onChange={handleFileSelect} className="hidden" />
        </div>

        {uploadError && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{uploadError}</div>
        )}

        {images.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-8 text-gray-400 hover:border-emerald-300 hover:text-emerald-500 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="mb-2 h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm">Tap to add receipt photos</span>
            <span className="mt-1 text-xs">You can add multiple photos</span>
          </button>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {images.map((img) => {
                const scan = scanState[img.id];
                return (
                  <div key={img.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => setViewingImage(img.signed_url)}
                      className="block w-full"
                    >
                      <img
                        src={img.signed_url}
                        alt={`Receipt ${img.sort_order + 1}`}
                        className="h-28 w-full rounded-lg object-cover"
                      />
                    </button>

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(img.id)}
                      disabled={isDeleting}
                      className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-sm sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>

                    {/* Scan button */}
                    <button
                      type="button"
                      onClick={() => handleScan(img.id)}
                      disabled={scan?.loading}
                      title="Scan receipt with AI"
                      className="absolute -left-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 disabled:opacity-60"
                    >
                      {scan?.loading ? (
                        <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <SparkleIcon className="h-3.5 w-3.5" />
                      )}
                    </button>

                    <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {img.sort_order + 1}/{images.length}
                    </span>
                  </div>
                );
              })}

              {/* Add more button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex h-28 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:border-emerald-300 hover:text-emerald-500 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            {/* Scan results — shown per image below the grid */}
            {images.map((img) => {
              const scan = scanState[img.id];
              if (!scan || scan.loading) return null;
              if (scan.error) {
                return (
                  <div key={`scan-err-${img.id}`} className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                    Photo {img.sort_order + 1}: {scan.error}
                    <button type="button" className="ml-2 underline" onClick={() => setScanState((p) => { const n = { ...p }; delete n[img.id]; return n; })}>Dismiss</button>
                  </div>
                );
              }
              if (scan.data) {
                return (
                  <ExtractedReceiptPanel
                    key={`scan-${img.id}`}
                    data={scan.data}
                    cartTotal={cart.total}
                    onClose={() => setScanState((p) => { const n = { ...p }; delete n[img.id]; return n; })}
                  />
                );
              }
              return null;
            })}
          </>
        )}
      </Card>

      {/* Cart items */}
      {items.length === 0 ? (
        <p className="py-12 text-center text-gray-500">No items in this cart.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const entry = item.product_entries;
            const price = entry?.price ?? 0;
            const subtotal = price * item.quantity;
            return (
              <Card key={item.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{entry?.products?.name ?? "Unknown product"}</p>
                    <p className="text-sm text-gray-500">
                      {entry?.stores?.name ?? "Unknown store"} &middot; ${price.toFixed(2)} x {item.quantity}
                    </p>
                  </div>
                  <p className="font-semibold text-gray-900">${subtotal.toFixed(2)}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <p className="text-lg font-bold text-gray-900">Total</p>
          <p className="text-lg font-bold text-emerald-600">${cart.total.toFixed(2)}</p>
        </div>
      </Card>

      {/* Image viewer modal */}
      {viewingImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setViewingImage(null)}>
          <button type="button" onClick={() => setViewingImage(null)} className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); const idx = images.findIndex((i) => i.signed_url === viewingImage); setViewingImage(images[idx <= 0 ? images.length - 1 : idx - 1].signed_url); }}
                className="absolute left-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); const idx = images.findIndex((i) => i.signed_url === viewingImage); setViewingImage(images[idx >= images.length - 1 ? 0 : idx + 1].signed_url); }}
                className="absolute right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}

          <img src={viewingImage} alt="Receipt" className="max-h-[90vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} />

          {images.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
              {images.findIndex((i) => i.signed_url === viewingImage) + 1} / {images.length}
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete photo?"
        message="This receipt photo will be permanently deleted."
        confirmLabel="Delete"
        loading={isDeleting}
      />
    </div>
  );
}
