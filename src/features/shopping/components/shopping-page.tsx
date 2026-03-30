"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CartItemDisplay } from "@/features/shopping/actions";
import { finalizeCart, updateCartStore } from "@/features/shopping/actions";
import type { CartShareInfo, SharedWithMeCart } from "@/features/shopping/actions-shares";
import { shareCart, getCartShares, revokeCartShare } from "@/features/shopping/actions-shares";
import { getListWithItems } from "@/features/lists/actions";
import { CartItemList } from "./cart-item-list";
import { QuickAddForm } from "./quick-add-form";
import { BarcodeScanner } from "./barcode-scanner";
import { ListTrackingPanel, type TrackingItem, findMatchingTrackingItems } from "./list-tracking-panel";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Store = { id: string; name: string; is_active?: boolean };
type ListPreview = { id: string; name: string; item_count: number };

type ShoppingPageProps = {
  cartId: string;
  initialStoreId: string | null;
  initialItems: CartItemDisplay[];
  stores: Store[];
  lists: ListPreview[];
  initialTrackingList: { id: string; name: string; items: TrackingItem[] } | null;
  sharedWithMeCarts?: SharedWithMeCart[];
  isSharedCart?: boolean;
  ownerEmail?: string;
  initialShares?: CartShareInfo[];
  currentUserId?: string;
  currentUserEmail?: string;
};

export function ShoppingPage({
  cartId,
  initialStoreId,
  initialItems,
  stores,
  lists,
  initialTrackingList,
  sharedWithMeCarts = [],
  isSharedCart = false,
  ownerEmail,
  initialShares = [],
  currentUserId = "",
  currentUserEmail = "",
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
  const [manuallyChecked, setManuallyChecked] = useState<Set<string>>(new Set());
  // Multi-match modal: when a new cart item matches multiple tracking items
  const [matchModal, setMatchModal] = useState<{
    cartItemName: string;
    candidates: TrackingItem[];
    selected: Set<string>;
  } | null>(null);

  // Share panel
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shares, setShares] = useState<CartShareInfo[]>(initialShares);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareLoading, startShareTransition] = useTransition();
  const [urlCopied, setUrlCopied] = useState(false);

  // Build a userId → email map from initial items + current user for realtime events
  const emailMapRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if ((item as unknown as { added_by?: string }).added_by && item.addedByEmail) {
        map.set((item as unknown as { added_by: string }).added_by, item.addedByEmail);
      }
    }
    if (currentUserId && currentUserEmail) {
      map.set(currentUserId, currentUserEmail);
    }
    emailMapRef.current = map;
  }, [items, currentUserId, currentUserEmail]);

  // Broadcast channel ref for sending events from this client
  const broadcastChannelRef = useRef<ReturnType<ReturnType<typeof createBrowserSupabaseClient>["channel"]> | null>(null);

  // Realtime subscription for cart items using Broadcast (works across RLS boundaries)
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel(`cart-sync-${cartId}`)
      // Broadcast: INSERT
      .on("broadcast", { event: "item-insert" }, (payload) => {
        const msg = payload.payload as {
          item: CartItemDisplay;
          senderId: string;
        };
        // Skip events from self (already handled optimistically)
        if (msg.senderId === currentUserId) return;
        setItems((prev) => {
          if (prev.find((i) => i.id === msg.item.id)) return prev;
          return [...prev, msg.item];
        });
      })
      // Broadcast: UPDATE
      .on("broadcast", { event: "item-update" }, (payload) => {
        const msg = payload.payload as {
          itemId: string;
          quantity: number;
          price?: number;
          originalPrice?: number | null;
          senderId: string;
        };
        if (msg.senderId === currentUserId) return;
        setItems((prev) =>
          prev.map((item) =>
            item.id === msg.itemId
              ? {
                  ...item,
                  quantity: msg.quantity,
                  price: msg.price ?? item.price,
                  originalPrice: msg.originalPrice !== undefined ? msg.originalPrice : item.originalPrice,
                  subtotal: (msg.price ?? item.price) * msg.quantity,
                }
              : item,
          ),
        );
      })
      // Broadcast: DELETE
      .on("broadcast", { event: "item-delete" }, (payload) => {
        const msg = payload.payload as { itemId: string; senderId: string };
        if (msg.senderId === currentUserId) return;
        setItems((prev) => prev.filter((item) => item.id !== msg.itemId));
      })
      // Broadcast: tracking list changed
      .on("broadcast", { event: "tracking-list-change" }, (payload) => {
        const msg = payload.payload as {
          listId: string | null;
          listName?: string;
          items?: TrackingItem[];
          senderId: string;
        };
        if (msg.senderId === currentUserId) return;
        if (!msg.listId) {
          setTrackingList(null);
        } else if (msg.listName && msg.items) {
          setTrackingList({ id: msg.listId, name: msg.listName, items: msg.items });
        }
      })
      // Also listen to postgres_changes as fallback for the cart owner
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "shopping_cart_items",
          filter: `cart_id=eq.${cartId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            product_id: string | null;
            product_name: string;
            product_barcode: string | null;
            price: number;
            original_price: number | null;
            quantity: number;
            added_by: string | null;
          };
          let addedByEmail = row.added_by
            ? emailMapRef.current.get(row.added_by) ?? (row.added_by === currentUserId ? currentUserEmail : undefined)
            : undefined;
          const newItem: CartItemDisplay = {
            id: row.id,
            productId: row.product_id,
            productName: row.product_name,
            productBarcode: row.product_barcode,
            price: row.price,
            originalPrice: row.original_price ?? null,
            quantity: row.quantity,
            subtotal: row.price * row.quantity,
            addedByEmail: addedByEmail || undefined,
          };
          setItems((prev) => {
            if (prev.find((i) => i.id === newItem.id)) return prev;
            return [...prev, newItem];
          });
          if (row.added_by && !addedByEmail) {
            supabase.rpc("get_profile_email_by_id", { user_id: row.added_by }).then(({ data }) => {
              if (data) {
                emailMapRef.current.set(row.added_by!, data);
                setItems((prev) =>
                  prev.map((i) => i.id === row.id ? { ...i, addedByEmail: data } : i),
                );
              }
            });
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "shopping_cart_items",
          filter: `cart_id=eq.${cartId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            product_id: string | null;
            product_name: string;
            product_barcode: string | null;
            price: number;
            original_price: number | null;
            quantity: number;
          };
          setItems((prev) =>
            prev.map((item) =>
              item.id === row.id
                ? {
                    ...item,
                    productId: row.product_id,
                    productName: row.product_name,
                    productBarcode: row.product_barcode,
                    price: row.price,
                    originalPrice: row.original_price ?? null,
                    quantity: row.quantity,
                    subtotal: row.price * row.quantity,
                  }
                : item,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "shopping_cart_items",
          filter: `cart_id=eq.${cartId}`,
        },
        (payload) => {
          const row = payload.old as { id: string };
          setItems((prev) => prev.filter((item) => item.id !== row.id));
        },
      )
      .subscribe();

    broadcastChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      broadcastChannelRef.current = null;
    };
  }, [cartId, currentUserId]);

  // Load shares when panel opens
  useEffect(() => {
    if (showSharePanel) {
      getCartShares(cartId).then(setShares);
    }
  }, [showSharePanel, cartId]);

  const handleItemAdded = useCallback((item: CartItemDisplay) => {
    setItems((prev) => {
      const exists = prev.find((i) => i.id === item.id);
      if (exists) return prev.map((i) => (i.id === item.id ? { ...item } : i));

      // Check for multi-match on tracking list (use current items before adding new one)
      if (trackingList) {
        const matches = findMatchingTrackingItems(item, trackingList.items, manuallyChecked, prev);
        if (matches.length >= 2) {
          // Show multi-match modal
          setMatchModal({
            cartItemName: item.productName,
            candidates: matches,
            selected: new Set(matches.map((m) => m.id)), // pre-select all
          });
        } else if (matches.length === 1) {
          // Auto-check the single match
          setManuallyChecked((s) => new Set([...s, matches[0].id]));
        }
      }

      return [...prev, item];
    });
    setScannedBarcode(undefined);
    // Broadcast to other participants
    broadcastChannelRef.current?.send({
      type: "broadcast",
      event: "item-insert",
      payload: { item, senderId: currentUserId },
    });
  }, [currentUserId, trackingList, manuallyChecked]);

  const handleManualCheck = useCallback((itemId: string) => {
    setManuallyChecked((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  function handleMatchModalConfirm() {
    if (!matchModal) return;
    setManuallyChecked((prev) => {
      const next = new Set(prev);
      for (const id of matchModal.selected) next.add(id);
      return next;
    });
    setMatchModal(null);
  }

  const handleItemRemoved = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    broadcastChannelRef.current?.send({
      type: "broadcast",
      event: "item-delete",
      payload: { itemId, senderId: currentUserId },
    });
  }, [currentUserId]);

  const handleItemUpdated = useCallback((itemId: string, newQuantity: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, quantity: newQuantity, subtotal: i.price * newQuantity } : i,
      ),
    );
    broadcastChannelRef.current?.send({
      type: "broadcast",
      event: "item-update",
      payload: { itemId, quantity: newQuantity, senderId: currentUserId },
    });
  }, [currentUserId]);

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
    const supabase = createBrowserSupabaseClient();
    if (!listId) {
      setTrackingList(null);
      // Save to DB + broadcast
      supabase.rpc("update_cart_tracking_list", { p_cart_id: cartId, p_tracking_list_id: null });
      broadcastChannelRef.current?.send({
        type: "broadcast",
        event: "tracking-list-change",
        payload: { listId: null, senderId: currentUserId },
      });
      return;
    }
    setLoadingList(true);
    const { list, items: listItems } = await getListWithItems(listId);
    if (list) {
      const trackingData = {
        id: list.id,
        name: list.name,
        items: listItems.map((i) => ({
          id: i.id,
          productId: i.product_id ?? null,
          name: (i.products as unknown as { name: string } | null)?.name ?? "Unknown",
          plannedQty: i.planned_quantity,
        })),
      };
      setTrackingList(trackingData);
      // Save to DB + broadcast
      supabase.rpc("update_cart_tracking_list", { p_cart_id: cartId, p_tracking_list_id: list.id });
      broadcastChannelRef.current?.send({
        type: "broadcast",
        event: "tracking-list-change",
        payload: { listId: list.id, listName: list.name, items: trackingData.items, senderId: currentUserId },
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

  function handleShare(e: React.FormEvent) {
    e.preventDefault();
    setShareError(null);
    const email = shareEmail.trim();
    if (!email) return;

    startShareTransition(async () => {
      const result = await shareCart(cartId, email);
      if (result.error) {
        setShareError(result.error);
      } else {
        setShareEmail("");
        const updatedShares = await getCartShares(cartId);
        setShares(updatedShares);
      }
    });
  }

  function handleRevoke(shareId: string) {
    startShareTransition(async () => {
      await revokeCartShare(shareId);
      const updatedShares = await getCartShares(cartId);
      setShares(updatedShares);
    });
  }

  function handleCopyUrl() {
    const url = `${window.location.origin}/shopping/join/${cartId}`;
    navigator.clipboard.writeText(url).then(() => {
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    }).catch(() => {
      setUrlCopied(false);
    });
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
          <p className="mb-1 text-3xl font-bold text-gray-900">&euro;{checkoutDone.total.toFixed(2)}</p>
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
          {isSharedCart ? (
            <div className="min-w-0 flex-1 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-800">
              {selectedStore?.name ?? "No store selected"}
            </div>
          ) : (
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
          )}

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

          {/* Total + checkout (owner only) */}
          {items.length > 0 && (
            <>
              <span className="shrink-0 text-sm font-semibold text-gray-700">
                &euro;{total.toFixed(2)}
              </span>
              {!isSharedCart && (
                <button
                  onClick={() => setShowCheckout(true)}
                  disabled={isCheckingOut}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isCheckingOut ? "…" : "Checkout"}
                </button>
              )}
            </>
          )}

          {/* Item count */}
          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {items.length}
          </span>

          {/* Share button (only for own carts) */}
          {!isSharedCart && (
            <button
              type="button"
              onClick={() => setShowSharePanel((v) => !v)}
              title="Share cart"
              className={`shrink-0 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                showSharePanel
                  ? "border-purple-200 bg-purple-50 text-purple-700"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Shared cart banner */}
      {isSharedCart && ownerEmail && (
        <div className="mx-auto w-full max-w-lg px-4 pt-3">
          <div className="rounded-lg bg-purple-50 px-4 py-2 text-sm text-purple-700">
            Shopping with <span className="font-medium">{ownerEmail}</span>
          </div>
        </div>
      )}

      {/* Shared-with-me invitations */}
      {sharedWithMeCarts.length > 0 && (
        <div className="mx-auto w-full max-w-lg px-4 pt-3 space-y-2">
          {sharedWithMeCarts.map((shared) => (
            <div
              key={shared.cartId}
              className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-2 text-sm"
            >
              <span className="text-blue-800">
                You&apos;re invited to{" "}
                <span className="font-medium">{shared.ownerEmail || "a shared"}</span>
                &apos;s cart
              </span>
              <a
                href={`/shopping?cart=${shared.cartId}`}
                className="ml-3 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
              >
                Join
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Share panel */}
      {showSharePanel && (
        <div className="mx-auto w-full max-w-lg px-4 pt-3">
          <div className="rounded-lg border border-purple-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Share this cart</h2>
            <form onSubmit={handleShare} className="mb-3 flex gap-2">
              <input
                type="email"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                placeholder="Enter email address"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <button
                type="submit"
                disabled={shareLoading || !shareEmail.trim()}
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {shareLoading ? "..." : "Invite"}
              </button>
            </form>
            {shareError && (
              <p className="mb-2 text-xs text-red-600">{shareError}</p>
            )}

            {/* Shareable link */}
            <div className="mb-3">
              <p className="mb-1 text-xs text-gray-500">Or share a link — anyone who opens it can join this cart.</p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={typeof window !== "undefined" ? `${window.location.origin}/shopping/join/${cartId}` : ""}
                  onFocus={(e) => e.target.select()}
                  className="min-w-0 flex-1 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs text-purple-700 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  title="Copy link"
                  className="shrink-0 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-purple-700 hover:bg-purple-100"
                >
                  {urlCopied ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {shares.length > 0 ? (
              <ul className="space-y-1">
                {shares.map((share) => (
                  <li
                    key={share.id}
                    className="flex items-center justify-between rounded bg-gray-50 px-3 py-1.5 text-sm"
                  >
                    <span className="text-gray-700">{share.sharedWithEmail}</span>
                    <button
                      type="button"
                      onClick={() => handleRevoke(share.id)}
                      disabled={shareLoading}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">No members yet. Invite someone by email.</p>
            )}
          </div>
        </div>
      )}

      {/* List tracking panel — sticky below header */}
      {trackingList && (
        <div className="sticky top-[57px] z-20">
          <ListTrackingPanel
            listName={trackingList.name}
            items={trackingList.items}
            cartItems={items}
            manuallyChecked={manuallyChecked}
            onManualCheck={handleManualCheck}
            onClose={() => {
              setTrackingList(null);
              setManuallyChecked(new Set());
              const supabase = createBrowserSupabaseClient();
              supabase.rpc("update_cart_tracking_list", { p_cart_id: cartId, p_tracking_list_id: null });
              broadcastChannelRef.current?.send({
                type: "broadcast",
                event: "tracking-list-change",
                payload: { listId: null, senderId: currentUserId },
              });
            }}
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
          isShared={isSharedCart || shares.length > 0}
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

      {/* Multi-match modal: product matches multiple tracking list items */}
      {matchModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setMatchModal(null); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-gray-900">Multiple matches found</h3>
              <p className="mt-1 text-sm text-gray-500">
                <span className="font-medium text-gray-700">&ldquo;{matchModal.cartItemName}&rdquo;</span> matches several items on your list. Which ones do you want to mark as picked?
              </p>
            </div>
            <ul className="max-h-60 overflow-y-auto p-3">
              {matchModal.candidates.map((item) => {
                const isSelected = matchModal.selected.has(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setMatchModal((prev) => {
                          if (!prev) return prev;
                          const next = new Set(prev.selected);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          return { ...prev, selected: next };
                        });
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition-colors ${
                        isSelected ? "bg-emerald-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isSelected ? "border-emerald-500 bg-emerald-500" : "border-gray-300 bg-white"
                      }`}>
                        {isSelected && (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <span className={isSelected ? "text-emerald-800 font-medium" : "text-gray-700"}>{item.name}</span>
                      {item.plannedQty !== 1 && (
                        <span className="ml-auto shrink-0 text-xs text-gray-400">&times;{item.plannedQty}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setMatchModal(null)}
                className="flex-1 rounded-xl bg-gray-100 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={handleMatchModalConfirm}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Mark picked ({matchModal.selected.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkout confirmation */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold text-gray-900">Finish shopping?</h3>
            <p className="mb-1 text-sm text-gray-500">
              {items.length} {items.length === 1 ? "item" : "items"} &middot;{" "}
              <span className="font-semibold text-gray-700">&euro;{total.toFixed(2)}</span>
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
