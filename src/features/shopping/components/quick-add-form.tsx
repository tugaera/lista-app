"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addCartItemOffline } from "@/lib/offline/cart-actions";
import type { CartItemDisplay } from "@/features/shopping/actions";
import { ProductSearch, type ProductResult } from "./product-search";
import { DiscountModal } from "./discount-modal";
import { Modal } from "@/components/ui/modal";
import { BrandSearch } from "@/features/brands/components/brand-search";
import { useT } from "@/i18n/i18n-provider";
import { useUser } from "@/features/users/components/user-provider";
import type { Category, Brand, Unit } from "@/types/database";
import { createProduct, adminUpdateProduct } from "@/features/products/actions";
import { getOrCreateBrand } from "@/features/brands/actions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type QuickAddFormProps = {
  cartId: string;
  storeId: string;
  onItemAdded: (item: CartItemDisplay) => void;
  scannedBarcode?: string;
  onBarcodeClear?: () => void;
  onScanRequest?: () => void;
  categories?: Category[];
  brands?: Brand[];
  units?: Unit[];
};

export function QuickAddForm({
  cartId,
  storeId,
  onItemAdded,
  scannedBarcode,
  onBarcodeClear,
  onScanRequest,
  categories = [],
  brands: _brands = [],
  units = [],
}: QuickAddFormProps) {
  const [productName, setProductName] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState<number | null>(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [barcode, setBarcode] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [barcodeStatus, setBarcodeStatus] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastScannedRef = useRef<string | undefined>(undefined);

  // Long-press state
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFiredRef = useRef(false);

  // Details modal state
  const [showDetails, setShowDetails] = useState(false);
  const [detailName, setDetailName] = useState("");
  const [detailBarcode, setDetailBarcode] = useState("");
  const [detailCategoryId, setDetailCategoryId] = useState("");
  const [detailSubcategoryId, setDetailSubcategoryId] = useState("");
  const [detailBrandSearch, setDetailBrandSearch] = useState("");
  const [detailBrandId, setDetailBrandId] = useState<string | null>(null);
  const [detailTags, setDetailTags] = useState("");
  const [detailMeasurementQty, setDetailMeasurementQty] = useState("");
  const [detailUnitId, setDetailUnitId] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const { t } = useT();
  const { isAdminOrModerator } = useUser();

  const hasDiscount = originalPrice !== null && originalPrice > parseFloat(price);
  const discountPct = hasDiscount
    ? Math.round((1 - parseFloat(price) / originalPrice!) * 100)
    : 0;

  // Can open details modal: admin/mod always, regular users only for new (not-in-DB) products
  const canOpenDetails = !!productName.trim() && (isAdminOrModerator || !selectedProductId);

  // When a barcode is scanned, look up the product
  useEffect(() => {
    if (!scannedBarcode || scannedBarcode === lastScannedRef.current) return;
    lastScannedRef.current = scannedBarcode;
    setBarcode(scannedBarcode);
    setSelectedProductId(null);
    setBarcodeStatus(t("shopping.lookingUpBarcode"));

    async function doLookup() {
      try {
        const { lookupBarcode } = await import("@/lib/barcode-lookup");
        const result = await lookupBarcode(scannedBarcode!);

        if (result.found) {
          setProductName(result.name);
          setSelectedProductId(result.productId ?? null);
          const { createBrowserSupabaseClient: mkClient } = await import("@/lib/supabase/client");
          const supabase = mkClient();
          const { data: entry } = await supabase
            .from("product_entries")
            .select("price")
            .eq("product_id", result.productId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
          if (entry) setPrice(entry.price.toFixed(2));
          setBarcodeStatus(`${t("shopping.foundProduct")} ${result.name}`);
        } else if (result.name) {
          setProductName(result.name);
          setBarcodeStatus(`${t("shopping.foundProduct")} ${result.name}`);
        } else {
          setBarcodeStatus(t("shopping.barcodeNotFound"));
        }
      } catch {
        setBarcodeStatus(t("shopping.barcodeLookupError"));
      }
    }

    doLookup();
  }, [scannedBarcode]);

  function handleProductSelect(product: ProductResult) {
    setProductName(product.name);
    setSelectedProductId(product.id);
    if (product.lastPrice != null) {
      setPrice(product.lastPrice.toFixed(2));
      setOriginalPrice(null);
    }
    setTimeout(() => {
      const priceInput = formRef.current?.querySelector<HTMLInputElement>('input[step="0.01"][inputmode="decimal"]');
      priceInput?.focus();
    }, 50);
  }

  function handleDiscountApply(result: { originalPrice: number; finalPrice: number }) {
    setOriginalPrice(result.originalPrice);
    setPrice(result.finalPrice.toFixed(2));
    setShowDiscountModal(false);
  }

  function doSubmit() {
    setError(null);

    if (!storeId) {
      setError(t("shopping.selectStoreFirst"));
      return;
    }

    const parsedPrice = parseFloat(price);
    const parsedQuantity = parseFloat(quantity);

    if (!productName.trim()) {
      setError(t("shopping.productNameRequired"));
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setError(t("shopping.invalidPrice"));
      return;
    }
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      setError(t("shopping.invalidQuantity"));
      return;
    }

    startTransition(async () => {
      try {
        const result = await addCartItemOffline(cartId, {
          productName: productName.trim(),
          price: parsedPrice,
          originalPrice: hasDiscount ? originalPrice : null,
          quantity: parsedQuantity,
          storeId,
          barcode,
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        onItemAdded(result);
        resetForm();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add item");
      }
    });
  }

  function resetForm() {
    setProductName("");
    setSelectedProductId(null);
    setPrice("");
    setOriginalPrice(null);
    setQuantity("1");
    setBarcode(undefined);
    setBarcodeStatus(null);
    lastScannedRef.current = undefined;
    onBarcodeClear?.();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSubmit();
  }

  // ── Long-press logic ─────────────────────────────────────────────────────

  async function openDetailsModal() {
    // Pre-fill modal with current form state
    setDetailName(productName);
    setDetailBarcode(barcode ?? "");
    setDetailCategoryId("");
    setDetailSubcategoryId("");
    setDetailBrandSearch("");
    setDetailBrandId(null);
    setDetailTags("");
    setDetailMeasurementQty("");
    setDetailUnitId(units.find((u) => u.is_default)?.id ?? "");
    setDetailError(null);

    // For admin/mod with an existing product, load its current details
    if (isAdminOrModerator && selectedProductId) {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: prod } = await supabase
          .from("products")
          .select("barcode, category_id, subcategory_id, brand_id, tags, measurement_quantity, unit_id")
          .eq("id", selectedProductId)
          .single();
        if (prod) {
          if (prod.barcode) setDetailBarcode(prod.barcode);
          setDetailCategoryId((prod.category_id as string | null) ?? "");
          setDetailSubcategoryId((prod.subcategory_id as string | null) ?? "");
          setDetailBrandId((prod.brand_id as string | null) ?? null);
          setDetailTags(((prod.tags as string[] | null) ?? []).join(", "));
          setDetailMeasurementQty(prod.measurement_quantity != null ? String(prod.measurement_quantity) : "");
          setDetailUnitId((prod.unit_id as string | null) ?? "");

          // Resolve brand name for BrandSearch display
          if (prod.brand_id) {
            const { data: brandRow } = await supabase
              .from("brands")
              .select("name")
              .eq("id", prod.brand_id)
              .single();
            if (brandRow) setDetailBrandSearch(brandRow.name);
          }
        }
      } catch {
        // silently ignore — modal still opens with partial data
      }
    }

    setShowDetails(true);
  }

  function handleHoldStart(e: React.MouseEvent | React.TouchEvent) {
    if (disabled || isPending || !canOpenDetails) return;
    // Prevent context menu on mobile long-press
    e.preventDefault();
    holdFiredRef.current = false;
    setIsHolding(true);
    holdTimerRef.current = setTimeout(() => {
      holdFiredRef.current = true;
      setIsHolding(false);
      holdTimerRef.current = null;
      openDetailsModal();
    }, 600);
  }

  function handleHoldEnd() {
    if (holdTimerRef.current) {
      // Timer hasn't fired yet → short press → normal submit
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      setIsHolding(false);
      if (!holdFiredRef.current) {
        doSubmit();
      }
    } else {
      setIsHolding(false);
    }
  }

  function handleHoldCancel() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
  }

  // ── Details modal submit ─────────────────────────────────────────────────

  async function handleDetailsSave() {
    setDetailLoading(true);
    setDetailError(null);

    // Resolve brand
    let resolvedBrandId = detailBrandId;
    if (detailBrandSearch.trim() && !resolvedBrandId) {
      const brandResult = await getOrCreateBrand(detailBrandSearch.trim());
      if (brandResult.error) { setDetailError(brandResult.error); setDetailLoading(false); return; }
      resolvedBrandId = brandResult.id ?? null;
    }
    if (!detailBrandSearch.trim()) resolvedBrandId = null;

    const parsedTags = detailTags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const parsedMeasurement = detailMeasurementQty ? parseFloat(detailMeasurementQty) : null;
    const resolvedBarcode = detailBarcode.trim() || undefined;

    let finalProductId = selectedProductId;

    if (isAdminOrModerator && selectedProductId) {
      // Update existing product
      const result = await adminUpdateProduct(selectedProductId, {
        name: detailName,
        barcode: resolvedBarcode,
        categoryId: detailCategoryId || undefined,
        subcategoryId: detailSubcategoryId || undefined,
        brandId: resolvedBrandId,
        tags: parsedTags,
        measurementQuantity: parsedMeasurement,
        unitId: detailUnitId || undefined,
      });
      if (result.error) { setDetailError(result.error); setDetailLoading(false); return; }
    } else {
      // Create new product
      const result = await createProduct({
        name: detailName,
        barcode: resolvedBarcode,
        categoryId: detailCategoryId || undefined,
        subcategoryId: detailSubcategoryId || undefined,
        brandId: resolvedBrandId,
        tags: parsedTags,
        measurementQuantity: parsedMeasurement,
        unitId: detailUnitId || undefined,
      });
      if (result.error) { setDetailError(result.error); setDetailLoading(false); return; }
      finalProductId = result.data?.id ?? null;
    }

    setDetailLoading(false);
    setShowDetails(false);

    // Update form with any changes from modal
    setProductName(detailName);
    if (resolvedBarcode) setBarcode(resolvedBarcode);
    if (finalProductId) setSelectedProductId(finalProductId);

    // Now add to cart
    const parsedPrice = parseFloat(price);
    const parsedQuantity = parseFloat(quantity);

    if (!isNaN(parsedPrice) && parsedPrice > 0 && !isNaN(parsedQuantity) && parsedQuantity > 0) {
      startTransition(async () => {
        try {
          const result = await addCartItemOffline(cartId, {
            productName: detailName,
            price: parsedPrice,
            originalPrice: hasDiscount ? originalPrice : null,
            quantity: parsedQuantity,
            storeId,
            barcode: resolvedBarcode,
          });
          if ("error" in result) {
            setError(result.error);
            return;
          }
          onItemAdded(result);
          resetForm();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to add item");
        }
      });
    }
  }

  const disabled = !storeId;
  const subcategories = categories.filter((c) => c.parent_id === detailCategoryId);

  return (
    <>
      <div className="fixed bottom-16 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-safe lg:bottom-0">
        <form ref={formRef} onSubmit={handleSubmit} className="mx-auto max-w-lg px-4 py-3">
          {barcodeStatus && (
            <p className="mb-2 text-xs font-medium text-emerald-600">{barcodeStatus}</p>
          )}
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          {disabled && (
            <p className="mb-2 text-xs text-amber-600">⚠ {t("shopping.selectStoreWarning")}</p>
          )}
          {/* Row 1: scanner + product name */}
          <div className="mb-2 flex gap-2">
            {onScanRequest && (
              <button
                type="button"
                onClick={onScanRequest}
                aria-label={t("shopping.scanBarcode")}
                className="flex-shrink-0 rounded-lg border border-gray-300 px-2.5 py-2 text-gray-600 hover:bg-gray-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </button>
            )}
            <div className="min-w-0 flex-1">
              <ProductSearch
                onSelect={handleProductSelect}
                placeholder={t("shopping.productNamePlaceholder")}
                value={productName}
                onValueChange={(v) => {
                  setProductName(v);
                  setSelectedProductId(null); // clear selection when manually typing
                }}
                disabled={disabled}
                storeId={storeId}
              />
            </div>
          </div>

          {/* Row 2: price + qty + discount + add */}
          <div className="flex gap-2">
            {/* Price */}
            <div className="relative w-24 flex-shrink-0">
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value);
                  setOriginalPrice(null);
                }}
                placeholder={t("shopping.price")}
                disabled={disabled}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-400 ${
                  hasDiscount
                    ? "border-orange-300 bg-orange-50 text-orange-700 focus:border-orange-400 focus:ring-orange-400"
                    : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                }`}
              />
              {hasDiscount && (
                <span className="pointer-events-none absolute -top-2 right-1 rounded-full bg-orange-500 px-1 py-0 text-[10px] font-bold leading-tight text-white">
                  −{discountPct}%
                </span>
              )}
            </div>

            <input
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={t("shopping.qty")}
              disabled={disabled}
              className="w-16 flex-shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />

            {/* Discount toggle */}
            <button
              type="button"
              onClick={() => setShowDiscountModal(true)}
              disabled={disabled}
              title={hasDiscount ? t("shopping.editDiscount") : t("shopping.addDiscount")}
              className={`flex-shrink-0 rounded-lg border px-2.5 py-2 text-sm transition-colors disabled:opacity-40 ${
                hasDiscount
                  ? "border-orange-300 bg-orange-50 text-orange-600"
                  : "border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M17 17h.01M7 17L17 7M7 7a2 2 0 100-4 2 2 0 000 4zm10 10a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </button>

            {/* Add button — long-press opens details modal */}
            <button
              type="button"
              onMouseDown={canOpenDetails ? handleHoldStart : undefined}
              onMouseUp={canOpenDetails ? handleHoldEnd : undefined}
              onMouseLeave={canOpenDetails ? handleHoldCancel : undefined}
              onTouchStart={canOpenDetails ? handleHoldStart : undefined}
              onTouchEnd={canOpenDetails ? handleHoldEnd : undefined}
              onTouchCancel={canOpenDetails ? handleHoldCancel : undefined}
              onClick={!canOpenDetails ? doSubmit : undefined}
              disabled={isPending || disabled}
              title={canOpenDetails ? t("shopping.holdToEditHint") : undefined}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 select-none ${
                isHolding ? "animate-hold-charge" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isPending ? "..." : t("common.add")}
            </button>
          </div>
        </form>
      </div>

      {showDiscountModal && (
        <DiscountModal
          initialPrice={originalPrice !== null ? originalPrice : (parseFloat(price) || undefined)}
          initialFinalPrice={originalPrice !== null ? (parseFloat(price) || undefined) : undefined}
          onConfirm={handleDiscountApply}
          onReset={() => setOriginalPrice(null)}
          onClose={() => setShowDiscountModal(false)}
        />
      )}

      {/* Product details modal */}
      {showDetails && (
        <Modal
          open={showDetails}
          onClose={() => { setShowDetails(false); setDetailError(null); }}
          title={t("shopping.productDetails")}
        >
          <div className="space-y-3">
            {/* Name */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t("products.productName")}</label>
              <input
                type="text"
                value={detailName}
                onChange={(e) => setDetailName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Barcode */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t("products.barcode")}</label>
              <input
                type="text"
                inputMode="numeric"
                value={detailBarcode}
                onChange={(e) => setDetailBarcode(e.target.value)}
                placeholder="e.g. 5601234567890"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Category */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t("products.category")}</label>
              <select
                value={detailCategoryId}
                onChange={(e) => { setDetailCategoryId(e.target.value); setDetailSubcategoryId(""); }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">{t("products.categoryOptional")}</option>
                {categories.filter((c) => !c.parent_id && c.is_active).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Subcategory */}
            {detailCategoryId && subcategories.length > 0 && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("products.subcategory")}</label>
                <select
                  value={detailSubcategoryId}
                  onChange={(e) => setDetailSubcategoryId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">{t("products.noSubcategory")}</option>
                  {subcategories.filter((c) => c.is_active).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Brand */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t("products.brand")}</label>
              <BrandSearch
                value={detailBrandSearch}
                brandId={detailBrandId}
                onChange={(name, id) => { setDetailBrandSearch(name); setDetailBrandId(id); }}
                placeholder={t("products.brandPlaceholder")}
              />
            </div>

            {/* Measurement: quantity + unit */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("products.measurementQuantity")}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  value={detailMeasurementQty}
                  onChange={(e) => setDetailMeasurementQty(e.target.value)}
                  placeholder="500"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("products.unit")}</label>
                <select
                  value={detailUnitId}
                  onChange={(e) => setDetailUnitId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">{t("products.selectUnit")}</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t("products.tags")}</label>
              <input
                type="text"
                value={detailTags}
                onChange={(e) => setDetailTags(e.target.value)}
                placeholder={t("products.tagsPlaceholder")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {detailError && <p className="text-sm text-red-600">{detailError}</p>}

            <button
              type="button"
              onClick={handleDetailsSave}
              disabled={detailLoading || !detailName.trim()}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {detailLoading ? "..." : t("shopping.saveAndAdd")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
