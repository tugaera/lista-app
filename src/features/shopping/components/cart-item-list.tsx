"use client";

import { useState, useTransition } from "react";
import {
  removeCartItem,
  updateCartItemQuantity,
} from "@/features/shopping/actions";
import type { CartItemDisplay } from "@/features/shopping/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type CartItemListProps = {
  items: CartItemDisplay[];
  cartId: string;
  onItemRemoved: (itemId: string) => void;
  onItemUpdated: (itemId: string, newQuantity: number) => void;
};

export function CartItemList({ items, cartId, onItemRemoved, onItemUpdated }: CartItemListProps) {
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const deleteItem = items.find((i) => i.id === deleteConfirm);

  function handleConfirmDelete() {
    if (!deleteConfirm) return;
    const itemId = deleteConfirm;

    onItemRemoved(itemId);
    setDeleteConfirm(null);

    startDeleteTransition(async () => {
      await removeCartItem(cartId, itemId);
    });
  }

  return (
    <div className="flex flex-col">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 text-4xl text-gray-300">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mx-auto h-16 w-16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">Cart is empty</p>
          <p className="mt-1 text-xs text-gray-400">
            Add items using the form below
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-gray-100">
            {items.map((item) => (
              <CartItemRow
                key={item.id}
                item={item}
                cartId={cartId}
                onDelete={() => setDeleteConfirm(item.id)}
                onItemUpdated={onItemUpdated}
              />
            ))}
          </ul>
          <div className="sticky bottom-24 border-t border-gray-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Total</span>
              <span className="text-lg font-bold text-gray-900">
                ${total.toFixed(2)}
              </span>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleConfirmDelete}
        title="Remove item"
        message={`Are you sure you want to remove "${deleteItem?.productName ?? "this item"}" from the cart?`}
        confirmLabel="Remove"
        loading={isDeleting}
      />
    </div>
  );
}

function CartItemRow({
  item,
  cartId,
  onDelete,
  onItemUpdated,
}: {
  item: CartItemDisplay;
  cartId: string;
  onDelete: () => void;
  onItemUpdated: (itemId: string, newQuantity: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editQuantity, setEditQuantity] = useState(String(item.quantity));
  const [isPending, startTransition] = useTransition();

  function handleQuantitySubmit() {
    const newQty = parseInt(editQuantity, 10);
    if (isNaN(newQty) || newQty <= 0) {
      setEditQuantity(String(item.quantity));
      setIsEditing(false);
      return;
    }

    if (newQty === item.quantity) {
      setIsEditing(false);
      return;
    }

    onItemUpdated(item.id, newQty);
    setIsEditing(false);
    startTransition(async () => {
      await updateCartItemQuantity(cartId, item.id, newQty);
    });
  }

  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${isPending ? "opacity-50" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {item.productName}
        </p>
        <p className="text-xs text-gray-500">
          ${item.price.toFixed(2)} each &middot; {item.storeName}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {isEditing ? (
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={editQuantity}
            onChange={(e) => setEditQuantity(e.target.value)}
            onBlur={handleQuantitySubmit}
            onKeyDown={(e) => e.key === "Enter" && handleQuantitySubmit()}
            autoFocus
            className="w-14 rounded border border-gray-300 px-2 py-1 text-center text-sm focus:border-blue-500 focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md bg-gray-100 px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            x{item.quantity}
          </button>
        )}
        <span className="w-16 text-right text-sm font-semibold text-gray-900">
          ${item.subtotal.toFixed(2)}
        </span>
        <button
          type="button"
          onClick={onDelete}
          disabled={isPending}
          className="ml-1 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
          aria-label={`Remove ${item.productName}`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </li>
  );
}
