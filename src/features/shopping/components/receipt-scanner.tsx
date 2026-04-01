"use client";

import { useState, useRef } from "react";
import { useT } from "@/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { uploadReceipt, processReceipt } from "@/features/shopping/actions-receipt";
import type { OcrLineItem } from "@/lib/services/receipt-ocr";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

interface EditableOcrItem extends OcrLineItem {
  id: string;
  status: "pending" | "accepted" | "rejected";
  matchedCartItemId: string | null;
}

interface ReceiptScannerProps {
  cartId: string;
  cartItems: CartItem[];
  onComplete: (acceptedItems: OcrLineItem[]) => void;
}

export function ReceiptScanner({
  cartId,
  cartItems,
  onComplete,
}: ReceiptScannerProps) {
  const { t } = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrItems, setOcrItems] = useState<EditableOcrItem[]>([]);
  const [receiptTotal, setReceiptTotal] = useState<number | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [receiptDate, setReceiptDate] = useState<string | null>(null);

  function findMatchingCartItem(ocrItemName: string): string | null {
    const normalizedName = ocrItemName.toLowerCase();
    for (const cartItem of cartItems) {
      if (
        cartItem.name.toLowerCase().includes(normalizedName) ||
        normalizedName.includes(cartItem.name.toLowerCase())
      ) {
        return cartItem.id;
      }
    }
    return null;
  }

  async function handleFileSelect(file: File) {
    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("receipt", file);

    const uploadResult = await uploadReceipt(cartId, formData);

    if (uploadResult.error || !uploadResult.url) {
      setError(uploadResult.error ?? "Upload failed");
      setUploading(false);
      return;
    }

    setUploading(false);
    setProcessing(true);

    const ocrResult = await processReceipt(uploadResult.url);

    if (ocrResult.error || !ocrResult.data) {
      setError(ocrResult.error ?? "OCR processing failed");
      setProcessing(false);
      return;
    }

    const editableItems: EditableOcrItem[] = ocrResult.data.items.map(
      (item, index) => ({
        ...item,
        id: `ocr-${index}`,
        status: "pending" as const,
        matchedCartItemId: findMatchingCartItem(item.name),
      })
    );

    setOcrItems(editableItems);
    setReceiptTotal(ocrResult.data.total);
    setStoreName(ocrResult.data.storeName);
    setReceiptDate(ocrResult.data.date);
    setProcessing(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }

  function updateItem(id: string, updates: Partial<EditableOcrItem>) {
    setOcrItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }

  function acceptItem(id: string) {
    updateItem(id, { status: "accepted" });
  }

  function rejectItem(id: string) {
    updateItem(id, { status: "rejected" });
  }

  function acceptAll() {
    setOcrItems((prev) =>
      prev.map((item) =>
        item.status === "pending" ? { ...item, status: "accepted" } : item
      )
    );
  }

  function handleComplete() {
    const accepted = ocrItems
      .filter((item) => item.status === "accepted")
      .map(({ name, price, quantity, confidence }) => ({
        name,
        price,
        quantity,
        confidence,
      }));
    onComplete(accepted);
  }

  const hasResults = ocrItems.length > 0;
  const pendingCount = ocrItems.filter((i) => i.status === "pending").length;
  const acceptedCount = ocrItems.filter((i) => i.status === "accepted").length;

  function getConfidenceColor(confidence: number): string {
    if (confidence >= 0.9) return "text-emerald-600";
    if (confidence >= 0.7) return "text-yellow-600";
    return "text-red-600";
  }

  function getMismatchInfo(item: EditableOcrItem): string | null {
    if (!item.matchedCartItemId) return t("receipt.noMatchingItem");
    const cartItem = cartItems.find((c) => c.id === item.matchedCartItemId);
    if (!cartItem) return null;
    if (Math.abs(cartItem.price - item.price) > 0.01) {
      return `${t("receipt.priceDiffers")} ($${cartItem.price.toFixed(2)})`;
    }
    if (cartItem.quantity !== item.quantity) {
      return `${t("receipt.qtyDiffers")} (${cartItem.quantity})`;
    }
    return null;
  }

  return (
    <div className="space-y-4">
      {!hasResults && (
        <div className="flex flex-col items-center gap-4 py-8">
          <svg
            className="h-16 w-16 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
            />
          </svg>

          <p className="text-sm text-gray-500">
            {t("receipt.uploadHint")}
          </p>

          <div className="flex gap-2">
            <Button onClick={() => fileInputRef.current?.click()}>
              {t("receipt.upload")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.capture = "environment";
                  fileInputRef.current.click();
                }
              }}
            >
              {t("receipt.takePhoto")}
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
      )}

      {(uploading || processing) && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Spinner size="lg" />
          <p className="text-sm text-gray-500">
            {uploading ? t("receipt.uploading") : t("receipt.processing")}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button
            className="ml-2 font-medium underline"
            onClick={() => {
              setError(null);
              fileInputRef.current?.click();
            }}
          >
            {t("receipt.tryAgain")}
          </button>
        </div>
      )}

      {hasResults && !processing && !uploading && (
        <>
          {/* Receipt header info */}
          {(storeName || receiptDate || receiptTotal !== null) && (
            <Card className="bg-gray-50">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {storeName && (
                  <span className="font-medium text-gray-900">
                    {storeName}
                  </span>
                )}
                {receiptDate && (
                  <span className="text-gray-500">{receiptDate}</span>
                )}
                {receiptTotal !== null && (
                  <span className="ml-auto font-semibold text-gray-900">
                    Total: ${receiptTotal.toFixed(2)}
                  </span>
                )}
              </div>
            </Card>
          )}

          {/* Action bar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {acceptedCount} {t("receipt.accepted")}, {pendingCount} {t("receipt.pending")},{" "}
              {ocrItems.length - acceptedCount - pendingCount} {t("receipt.rejected")}
            </p>
            <div className="flex gap-2">
              {pendingCount > 0 && (
                <Button variant="secondary" size="sm" onClick={acceptAll}>
                  {t("receipt.acceptAll")}
                </Button>
              )}
              {acceptedCount > 0 && (
                <Button size="sm" onClick={handleComplete}>
                  {t("common.done")}
                </Button>
              )}
            </div>
          </div>

          {/* OCR items list */}
          <div className="space-y-2">
            {ocrItems.map((item) => {
              const mismatch = getMismatchInfo(item);
              return (
                <Card
                  key={item.id}
                  className={
                    item.status === "rejected"
                      ? "opacity-50"
                      : item.status === "accepted"
                        ? "border-emerald-200 bg-emerald-50/50"
                        : ""
                  }
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) =>
                            updateItem(item.id, { name: e.target.value })
                          }
                          className="min-w-0 flex-1 truncate border-none bg-transparent p-0 font-medium text-gray-900 focus:outline-none focus:ring-0"
                        />
                        <span
                          className={`flex-shrink-0 text-xs ${getConfidenceColor(item.confidence)}`}
                        >
                          {Math.round(item.confidence * 100)}%
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-3 text-sm">
                        <label className="flex items-center gap-1 text-gray-500">
                          $
                          <input
                            type="number"
                            step="0.01"
                            value={item.price}
                            onChange={(e) =>
                              updateItem(item.id, {
                                price: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-16 border-none bg-transparent p-0 text-gray-700 focus:outline-none focus:ring-0"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-gray-500">
                          qty:
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) =>
                              updateItem(item.id, {
                                quantity: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-12 border-none bg-transparent p-0 text-gray-700 focus:outline-none focus:ring-0"
                          />
                        </label>
                      </div>

                      {mismatch && (
                        <p className="mt-1 text-xs text-yellow-600">
                          {mismatch}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-shrink-0 gap-1">
                      {item.status !== "accepted" && (
                        <button
                          onClick={() => acceptItem(item.id)}
                          className="rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-50"
                          title="Accept"
                        >
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m4.5 12.75 6 6 9-13.5"
                            />
                          </svg>
                        </button>
                      )}
                      {item.status !== "rejected" && (
                        <button
                          onClick={() => rejectItem(item.id)}
                          className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50"
                          title="Reject"
                        >
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={2}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18 18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
