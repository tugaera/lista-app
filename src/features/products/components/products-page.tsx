"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { useDebounce } from "@/hooks/useDebounce";
import { useT } from "@/i18n/i18n-provider";
import { useUser } from "@/features/users/components/user-provider";
import dynamic from "next/dynamic";
const BarcodeScanner = dynamic(
  () => import("@/features/shopping/components/barcode-scanner").then((m) => ({ default: m.BarcodeScanner })),
  { ssr: false },
);
import { lookupBarcode } from "@/lib/barcode-lookup";
import {
  searchProducts,
  getAdminProducts,
  createProduct,
  getProductWithHistory,
  adminUpdateProduct,
  adminToggleProductActive,
  adminDeleteProduct,
  checkProductDependencies,
  adminAddPriceEntry,
  adminUpdatePriceEntry,
  adminDeletePriceEntry,
  type ProductWithLatestPrice,
  type ProductWithHistory,
  type ProductDependencies,
  type PriceEntryData,
} from "@/features/products/actions";
import type { Category, ProductEntry } from "@/types/database";
import type { Store } from "@/features/stores/actions";

interface ProductsPageProps {
  categories: Category[];
  stores?: Store[];
}

type PriceHistoryEntry = ProductEntry & { store_name: string };

type PriceForm = {
  entryId: string | null;
  storeId: string;
  price: string;
  originalPrice: string;
  quantity: string;
  date: string;
};

function BarcodeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 9V5a2 2 0 012-2h2M3 15v4a2 2 0 002 2h2M15 3h4a2 2 0 012 2v4M15 21h4a2 2 0 002-2v-4" />
      <line x1="7" y1="8" x2="7" y2="16" />
      <line x1="10" y1="8" x2="10" y2="16" />
      <line x1="13" y1="8" x2="13" y2="16" />
      <line x1="16" y1="8" x2="16" y2="16" />
    </svg>
  );
}

function todayISODate() {
  return new Date().toISOString().slice(0, 16);
}

export function ProductsPage({ categories, stores = [] }: ProductsPageProps) {
  const { t } = useT();
  const { isAdminOrModerator } = useUser();

  // Search
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [products, setProducts] = useState<ProductWithLatestPrice[]>([]);
  const [loading, setLoading] = useState(false);

  // Detail modal
  const [selectedProduct, setSelectedProduct] = useState<ProductWithHistory | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // Edit mode inside detail modal (admin only)
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editScanning, setEditScanning] = useState(false);

  // Price history CRUD (admin only)
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [priceForm, setPriceForm] = useState<PriceForm | null>(null);
  const [priceFormLoading, setPriceFormLoading] = useState(false);
  const [priceFormError, setPriceFormError] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [confirmDeleteEntryId, setConfirmDeleteEntryId] = useState<string | null>(null);

  // Add product modal
  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addScanning, setAddScanning] = useState(false);
  const [addLookupStatus, setAddLookupStatus] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newBarcode, setNewBarcode] = useState("");
  const [newCategoryId, setNewCategoryId] = useState("");

  // Toggle active (admin only)
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  // Delete product (admin only)
  type DeleteTarget = { id: string; name: string };
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteDeps, setDeleteDeps] = useState<ProductDependencies | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Search ──────────────────────────────────────────────────────────────

  const doSearch = useCallback(async (searchQuery: string) => {
    setLoading(true);
    // Admin/mod sees all products (including inactive); regular users see active only
    const { data } = isAdminOrModerator
      ? await getAdminProducts(searchQuery)
      : await searchProducts(searchQuery);
    setProducts(data);
    setLoading(false);
  }, [isAdminOrModerator]);

  useEffect(() => {
    if (debouncedQuery.length >= 2) {
      doSearch(debouncedQuery);
    } else if (debouncedQuery.length === 0) {
      doSearch("");
    }
  }, [debouncedQuery, doSearch]);

  // ── Product detail / edit ───────────────────────────────────────────────

  async function handleProductClick(productId: string) {
    setDetailLoading(true);
    setDetailOpen(true);
    setEditing(false);
    setEditError(null);
    setPriceForm(null);
    setPriceFormError(null);
    setConfirmDeleteEntryId(null);
    const { data } = await getProductWithHistory(productId);
    setSelectedProduct(data);
    setPriceHistory((data?.entries ?? []) as PriceHistoryEntry[]);
    setDetailLoading(false);
  }

  function enterEditMode() {
    if (!selectedProduct) return;
    setEditing(true);
    setEditName(selectedProduct.name);
    setEditBarcode(selectedProduct.barcode ?? "");
    setEditCategoryId(selectedProduct.category_id ?? "");
    setEditError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setEditError(null);
    setPriceForm(null);
    setPriceFormError(null);
  }

  async function handleSaveEdit() {
    if (!selectedProduct) return;
    setEditLoading(true);
    setEditError(null);
    const result = await adminUpdateProduct(selectedProduct.id, {
      name: editName,
      barcode: editBarcode,
      categoryId: editCategoryId,
    });
    if (result.error) {
      setEditError(result.error);
      setEditLoading(false);
      return;
    }
    // Update local state
    const catName = categories.find((c) => c.id === editCategoryId)?.name ?? null;
    setSelectedProduct({
      ...selectedProduct,
      name: editName,
      barcode: editBarcode || null,
      category_id: editCategoryId || null,
      category_name: catName,
    });
    setProducts((prev) =>
      prev.map((p) =>
        p.id === selectedProduct.id
          ? { ...p, name: editName, barcode: editBarcode || null, category_id: editCategoryId || null, category_name: catName }
          : p,
      ),
    );
    setEditing(false);
    setEditLoading(false);
  }

  async function handleEditBarcodeScan(barcode: string) {
    setEditScanning(false);
    setEditBarcode(barcode);
    const result = await lookupBarcode(barcode);
    if (result.found && !editName) setEditName(result.name);
    else if (!result.found && result.name && !editName) setEditName(result.name);
  }

  // ── Toggle active ───────────────────────────────────────────────────────

  async function handleToggle(product: ProductWithLatestPrice) {
    setToggling((s) => new Set(s).add(product.id));
    await adminToggleProductActive(product.id, !product.is_active);
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, is_active: !p.is_active } : p)),
    );
    // If we're viewing this product in the detail, update it too
    if (selectedProduct?.id === product.id) {
      setSelectedProduct({ ...selectedProduct, is_active: !product.is_active });
    }
    setToggling((s) => {
      const next = new Set(s);
      next.delete(product.id);
      return next;
    });
  }

  // ── Delete product ──────────────────────────────────────────────────────

  async function openDelete(product: { id: string; name: string }) {
    setDeleteTarget({ id: product.id, name: product.name });
    setDeleteDeps(null);
    setDeleteError(null);
    setDeleteChecking(true);
    const { deps } = await checkProductDependencies(product.id);
    setDeleteDeps(deps);
    setDeleteChecking(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    const { error } = await adminDeleteProduct(deleteTarget.id);
    if (error) {
      setDeleteError(error);
      setDeleteLoading(false);
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    // Close detail modal if we deleted the viewed product
    if (selectedProduct?.id === deleteTarget.id) {
      setDetailOpen(false);
      setSelectedProduct(null);
    }
    setDeleteTarget(null);
    setDeleteDeps(null);
    setDeleteLoading(false);
  }

  // ── Price history CRUD ──────────────────────────────────────────────────

  function openPriceForm(entry?: PriceHistoryEntry) {
    setPriceFormError(null);
    if (entry) {
      setPriceForm({
        entryId: entry.id,
        storeId: entry.store_id,
        price: String(entry.price),
        originalPrice: entry.original_price != null ? String(entry.original_price) : "",
        quantity: String(entry.quantity),
        date: entry.created_at.slice(0, 16),
      });
    } else {
      setPriceForm({
        entryId: null,
        storeId: stores[0]?.id ?? "",
        price: "",
        originalPrice: "",
        quantity: "1",
        date: todayISODate(),
      });
    }
  }

  async function handleSavePriceEntry() {
    if (!priceForm || !selectedProduct) return;
    const price = parseFloat(priceForm.price);
    const quantity = parseFloat(priceForm.quantity);
    if (!priceForm.storeId) { setPriceFormError(t("admin.selectStore")); return; }
    if (isNaN(price) || price < 0) { setPriceFormError(t("shopping.invalidPrice")); return; }
    if (isNaN(quantity) || quantity <= 0) { setPriceFormError(t("shopping.invalidQuantity")); return; }
    if (!priceForm.date) { setPriceFormError(t("common.required")); return; }

    setPriceFormLoading(true);
    setPriceFormError(null);

    const data: PriceEntryData = {
      storeId: priceForm.storeId,
      price,
      originalPrice: priceForm.originalPrice ? parseFloat(priceForm.originalPrice) : null,
      quantity,
      date: new Date(priceForm.date).toISOString(),
    };

    const result = priceForm.entryId
      ? await adminUpdatePriceEntry(priceForm.entryId, data)
      : await adminAddPriceEntry(selectedProduct.id, data);

    if (result.error) {
      setPriceFormError(result.error);
      setPriceFormLoading(false);
      return;
    }

    const { data: updated } = await getProductWithHistory(selectedProduct.id);
    setPriceHistory((updated?.entries ?? []) as PriceHistoryEntry[]);
    setPriceForm(null);
    setPriceFormLoading(false);
  }

  async function handleDeletePriceEntry(entryId: string) {
    if (!selectedProduct) return;
    setDeletingEntryId(entryId);
    await adminDeletePriceEntry(entryId);
    setPriceHistory((prev) => prev.filter((e) => e.id !== entryId));
    setConfirmDeleteEntryId(null);
    setDeletingEntryId(null);
  }

  // ── Add product ─────────────────────────────────────────────────────────

  async function handleAddProduct() {
    if (!newName.trim()) {
      setAddError(t("shopping.productNameRequired"));
      return;
    }
    setAddLoading(true);
    setAddError(null);
    const { error } = await createProduct({
      name: newName.trim(),
      barcode: newBarcode.trim() || undefined,
      categoryId: newCategoryId || undefined,
    });
    if (error) {
      setAddError(error);
      setAddLoading(false);
      return;
    }
    setAddOpen(false);
    setNewName("");
    setNewBarcode("");
    setNewCategoryId("");
    setAddLookupStatus(null);
    setAddLoading(false);
    doSearch(debouncedQuery);
  }

  async function handleBarcodeScan(barcode: string) {
    setAddScanning(false);
    setNewBarcode(barcode);
    setAddLookupStatus(t("shopping.lookingUpBarcode"));
    const result = await lookupBarcode(barcode);
    if (result.found) {
      setNewName(result.name);
      setAddLookupStatus(`${t("products.alreadyInDB")} "${result.name}"`);
    } else if (result.name) {
      setNewName(result.name);
      setAddLookupStatus(`${t("products.foundOnOFF")} "${result.name}"`);
    } else {
      setAddLookupStatus(t("products.notFoundHint"));
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t("products.title")}</h1>
        <Button onClick={() => setAddOpen(true)}>{t("products.addProduct")}</Button>
      </div>

      <div className="mb-6">
        <Input
          placeholder={t("products.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          }
          title={t("products.noResults")}
          description={query ? t("products.noResultsHint") : t("products.noProductsHint")}
          action={<Button onClick={() => setAddOpen(true)}>{t("products.addProduct")}</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card
              key={product.id}
              className={`cursor-pointer transition hover:shadow-md ${
                !product.is_active ? "bg-red-50/60 border-red-200/60" : ""
              }`}
            >
              <button
                className="w-full text-left"
                onClick={() => handleProductClick(product.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className={`truncate font-medium ${product.is_active ? "text-gray-900" : "text-gray-400"}`}>
                        {product.name}
                      </h3>
                      {!product.is_active && isAdminOrModerator && (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                          {t("admin.disabled")}
                        </span>
                      )}
                    </div>
                    {product.category_name && (
                      <p className="mt-0.5 text-sm text-gray-500">{product.category_name}</p>
                    )}
                  </div>
                  {product.barcode && (
                    <span className="ml-2 flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      <BarcodeIcon />
                    </span>
                  )}
                </div>
                {product.latest_price !== null && (() => {
                  const hasDiscount = product.latest_original_price != null && product.latest_original_price > product.latest_price;
                  return (
                    <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-2">
                      <div className="flex items-center gap-1.5">
                        {hasDiscount && (
                          <span className="text-sm text-gray-400 line-through">€{product.latest_original_price!.toFixed(2)}</span>
                        )}
                        <span className={`text-lg font-semibold ${hasDiscount ? "text-orange-600" : "text-emerald-600"}`}>
                          €{product.latest_price.toFixed(2)}
                        </span>
                        {hasDiscount && (
                          <span className="rounded bg-orange-100 px-1 py-0.5 text-xs font-medium text-orange-700">
                            −{Math.round((1 - product.latest_price / product.latest_original_price!) * 100)}%
                          </span>
                        )}
                      </div>
                      {product.latest_store_name && (
                        <span className="text-xs text-gray-400">
                          {product.latest_store_name}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </button>

            </Card>
          ))}
        </div>
      )}

      {/* ── Product Detail / Edit Modal ───────────────────────────────────── */}
      <Modal
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedProduct(null); setEditing(false); setPriceForm(null); }}
        title={editing ? t("admin.editProduct") : (selectedProduct?.name ?? t("products.productDetails"))}
      >
        {detailLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : selectedProduct ? (
          <div>
            {/* ── Basic Info section ─────────────────────────────────────── */}
            {editing ? (
              <>
                {editScanning && (
                  <BarcodeScanner onScan={handleEditBarcodeScan} onClose={() => setEditScanning(false)} />
                )}
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">{t("admin.basicInfo")}</p>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t("admin.name")} *</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t("admin.barcode")}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editBarcode}
                        onChange={(e) => setEditBarcode(e.target.value)}
                        placeholder={t("common.optional")}
                        className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setEditScanning(true)}
                        className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        <BarcodeIcon />
                        {t("products.scan")}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t("admin.category")}</label>
                    <select
                      value={editCategoryId}
                      onChange={(e) => setEditCategoryId(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">{t("common.noCategory")}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  {editError && <p className="text-sm text-red-600">{editError}</p>}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      disabled={editLoading}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {editLoading ? t("common.saving") : t("common.save")}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="mb-4 space-y-2">
                {selectedProduct.category_name && (
                  <p className="text-sm text-gray-500">
                    {t("products.category")}:{" "}
                    <span className="font-medium text-gray-700">{selectedProduct.category_name}</span>
                  </p>
                )}
                {selectedProduct.barcode && (
                  <p className="text-sm text-gray-500">
                    {t("products.barcode")}:{" "}
                    <span className="font-mono font-medium text-gray-700">{selectedProduct.barcode}</span>
                  </p>
                )}
                {!selectedProduct.is_active && (
                  <p className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                    {t("admin.disabled")}
                  </p>
                )}
                {/* Admin action buttons */}
                {isAdminOrModerator && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={enterEditMode}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                    >
                      {t("common.edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggle(selectedProduct as unknown as ProductWithLatestPrice)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                        selectedProduct.is_active
                          ? "border-orange-200 text-orange-600 hover:bg-orange-50"
                          : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                      }`}
                    >
                      {selectedProduct.is_active ? t("common.disable") : t("common.enable")}
                    </button>
                    <button
                      type="button"
                      onClick={() => openDelete({ id: selectedProduct.id, name: selectedProduct.name })}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Price History section ──────────────────────────────────── */}
            <div className={editing ? "mt-6" : ""}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">{t("products.priceHistory")}</h3>
                {isAdminOrModerator && !priceForm && (
                  <button
                    type="button"
                    onClick={() => openPriceForm()}
                    className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    {t("admin.addEntry")}
                  </button>
                )}
              </div>

              {priceHistory.length === 0 && !priceForm ? (
                <p className="text-sm text-gray-400">{t("products.noPriceHistory")}</p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {priceHistory.map((entry) => {
                    const orig = entry.original_price;
                    const hasDiscount = orig != null && orig > entry.price;
                    const isConfirmingDelete = confirmDeleteEntryId === entry.id;
                    const isDeleting = deletingEntryId === entry.id;
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                      >
                        <div>
                          {hasDiscount ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-gray-400 line-through">€{orig!.toFixed(2)}</span>
                              <span className="font-medium text-orange-600">€{entry.price.toFixed(2)}</span>
                              <span className="rounded bg-orange-100 px-1 py-0.5 text-xs font-medium text-orange-700">
                                −{Math.round((1 - entry.price / orig!) * 100)}%
                              </span>
                            </div>
                          ) : (
                            <span className="font-medium text-gray-900">€{entry.price.toFixed(2)}</span>
                          )}
                          <span className="ml-1 text-sm text-gray-500">x{entry.quantity}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-sm text-gray-600">{entry.store_name}</p>
                            <p className="text-xs text-gray-400">
                              {new Date(entry.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          {/* Admin edit/delete buttons */}
                          {isAdminOrModerator && (
                            <div className="flex shrink-0 items-center gap-1">
                              {isConfirmingDelete ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePriceEntry(entry.id)}
                                    disabled={isDeleting}
                                    className="rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                  >
                                    {isDeleting ? "…" : t("common.yes")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteEntryId(null)}
                                    className="rounded border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                                  >
                                    {t("common.no")}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => { setPriceForm(null); setTimeout(() => openPriceForm(entry), 0); }}
                                    className="rounded border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                                  >
                                    {t("common.edit")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteEntryId(entry.id)}
                                    className="rounded border border-red-200 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50"
                                  >
                                    {t("common.delete")}
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Price entry form (admin only) */}
              {isAdminOrModerator && priceForm && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="mb-3 text-sm font-medium text-emerald-800">
                    {priceForm.entryId ? t("admin.editEntry") : t("admin.addPriceEntry")}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs font-medium text-gray-700">{t("admin.supermarket")} *</label>
                      <select
                        value={priceForm.storeId}
                        onChange={(e) => setPriceForm({ ...priceForm, storeId: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                      >
                        <option value="">{t("admin.selectStore")}</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">{t("admin.price")} *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={priceForm.price}
                        onChange={(e) => setPriceForm({ ...priceForm, price: e.target.value })}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">{t("admin.originalPrice")}</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={priceForm.originalPrice}
                        onChange={(e) => setPriceForm({ ...priceForm, originalPrice: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">{t("admin.quantity")} *</label>
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        value={priceForm.quantity}
                        onChange={(e) => setPriceForm({ ...priceForm, quantity: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-700">{t("admin.date")} *</label>
                      <input
                        type="datetime-local"
                        value={priceForm.date}
                        onChange={(e) => setPriceForm({ ...priceForm, date: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  {priceFormError && <p className="mt-2 text-xs text-red-600">{priceFormError}</p>}
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setPriceForm(null); setPriceFormError(null); }}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={handleSavePriceEntry}
                      disabled={priceFormLoading}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {priceFormLoading ? t("common.saving") : t("admin.saveEntry")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ── Add Product Modal ─────────────────────────────────────────────── */}
      {addScanning && (
        <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setAddScanning(false)} />
      )}
      <Modal
        open={addOpen}
        onClose={() => { setAddOpen(false); setAddError(null); setAddLookupStatus(null); }}
        title={t("products.addProduct")}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t("products.barcodeScanHint")}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newBarcode}
                onChange={(e) => setNewBarcode(e.target.value)}
                placeholder={t("common.optional")}
                className="min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-2 font-mono text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <button
                type="button"
                onClick={() => setAddScanning(true)}
                className="flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                <BarcodeIcon />
                {t("products.scan")}
              </button>
            </div>
            {addLookupStatus && (
              <p className={`text-xs ${addLookupStatus.includes(t("products.alreadyInDB")) ? "text-amber-600" : "text-emerald-600"}`}>
                {addLookupStatus}
              </p>
            )}
          </div>
          <Input
            label={t("common.name")}
            placeholder={t("products.productName")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            error={addError ?? undefined}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">{t("products.categoryOptional")}</label>
            <select
              value={newCategoryId}
              onChange={(e) => setNewCategoryId(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-2 text-gray-900 transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">{t("common.noCategory")}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setAddOpen(false); setAddError(null); setAddLookupStatus(null); }}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleAddProduct} loading={addLoading}>
              {t("products.addProduct")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Product Modal (admin only) ─────────────────────────────── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !deleteLoading) setDeleteTarget(null); }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold text-gray-900">{t("admin.deleteProduct")}</h3>
            <p className="mb-4 text-sm text-gray-500">
              {t("common.delete")} <span className="font-medium text-gray-900">{deleteTarget.name}</span>?
            </p>

            {deleteChecking ? (
              <p className="mb-4 text-sm text-gray-400">{t("common.loading")}</p>
            ) : deleteDeps && (
              <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
                {deleteDeps.cartItemCount === 0 && deleteDeps.historyCount === 0 && deleteDeps.priceEntryCount === 0 && deleteDeps.listItemCount === 0 ? (
                  <p className="text-emerald-700 font-medium">No dependencies found — safe to delete.</p>
                ) : (
                  <>
                    <p className="font-medium text-amber-700 mb-2">This product has dependencies:</p>
                    {deleteDeps.cartItemCount > 0 && (
                      <p className="text-red-600">• {deleteDeps.cartItemCount} active cart item{deleteDeps.cartItemCount !== 1 ? "s" : ""}</p>
                    )}
                    {deleteDeps.historyCount > 0 && (
                      <p className="text-amber-600">• {deleteDeps.historyCount} finalized cart item{deleteDeps.historyCount !== 1 ? "s" : ""}</p>
                    )}
                    {deleteDeps.priceEntryCount > 0 && (
                      <p className="text-amber-600">• {deleteDeps.priceEntryCount} price entr{deleteDeps.priceEntryCount !== 1 ? "ies" : "y"}</p>
                    )}
                    {deleteDeps.listItemCount > 0 && (
                      <p className="text-amber-600">• {deleteDeps.listItemCount} list item{deleteDeps.listItemCount !== 1 ? "s" : ""}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {deleteError && <p className="mb-3 text-sm text-red-600">{deleteError}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading || deleteChecking}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? t("common.deleting") : t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
