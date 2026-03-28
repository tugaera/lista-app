"use client";

import {
  addCartItem,
  removeCartItem,
  updateCartItemQuantity,
  type CartItemDisplay,
} from "@/features/shopping/actions";
import { queueMutation } from "@/lib/offline/sync";
import db from "@/lib/offline/db";

/**
 * Wraps addCartItem: queues to Dexie if offline, returns optimistic result.
 */
export async function addCartItemOffline(
  cartId: string,
  data: {
    productName: string;
    price: number;
    originalPrice?: number | null;
    quantity: number;
    storeId: string;
    barcode?: string;
  },
): Promise<CartItemDisplay | { error: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const tempId = crypto.randomUUID();
    await queueMutation("shopping_cart_items", "insert", {
      id: tempId,
      cart_id: cartId,
      product_name: data.productName,
      product_barcode: data.barcode ?? null,
      price: data.price,
      original_price: data.originalPrice ?? null,
      quantity: data.quantity,
    });
    // Also store in offline cart items for local display
    await db.offlineCartItems.put({
      id: tempId,
      productName: data.productName,
      price: data.price,
      quantity: data.quantity,
      storeId: data.storeId,
      storeName: "",
      createdAt: new Date().toISOString(),
    });
    return {
      id: tempId,
      productId: null,
      productName: data.productName,
      productBarcode: data.barcode ?? null,
      price: data.price,
      originalPrice: data.originalPrice ?? null,
      quantity: data.quantity,
      subtotal: data.price * data.quantity,
    };
  }
  return addCartItem(cartId, data);
}

/**
 * Wraps removeCartItem: queues to Dexie if offline.
 */
export async function removeCartItemOffline(
  cartId: string,
  itemId: string,
): Promise<{ error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await queueMutation("shopping_cart_items", "delete", {
      id: itemId,
    });
    await db.offlineCartItems.delete(itemId);
    return {};
  }
  return removeCartItem(cartId, itemId);
}

/**
 * Wraps updateCartItemQuantity: queues to Dexie if offline.
 */
export async function updateCartItemQuantityOffline(
  cartId: string,
  itemId: string,
  quantity: number,
): Promise<{ error?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    await queueMutation("shopping_cart_items", "update", {
      id: itemId,
      cart_id: cartId,
      quantity,
    });
    // Update local cache
    const existing = await db.offlineCartItems.get(itemId);
    if (existing) {
      await db.offlineCartItems.put({ ...existing, quantity });
    }
    return {};
  }
  return updateCartItemQuantity(cartId, itemId, quantity);
}
