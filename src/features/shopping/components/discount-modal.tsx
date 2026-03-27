"use client";

import { useEffect, useRef, useState } from "react";

interface DiscountResult {
  originalPrice: number;
  finalPrice: number;
}

interface DiscountModalProps {
  initialPrice?: number;      // original (pre-discount) price
  initialFinalPrice?: number; // final (post-discount) price, when re-opening an existing discount
  onConfirm: (result: DiscountResult) => void;
  onClose: () => void;
}

type Field = "original" | "final" | "pct" | "amount";

function recalculate(
  changed: Field,
  values: Record<Field, string>,
): Record<Field, string> {
  const parse = (k: Field) => {
    const v = parseFloat(values[k]);
    return isNaN(v) || v < 0 ? null : v;
  };

  const next = { ...values };

  const fmt = (n: number) => (n < 0 ? "0" : n.toFixed(2));
  const fmtPct = (n: number) => (n < 0 ? "0" : n.toFixed(1));

  const orig = parse("original");
  const fin  = parse("final");
  const pct  = parse("pct");
  const amt  = parse("amount");

  if (changed === "original" || changed === "pct") {
    if (orig !== null && pct !== null) {
      const f = orig * (1 - pct / 100);
      next.final  = fmt(f);
      next.amount = fmt(orig - f);
    } else if (orig !== null && amt !== null) {
      const f = orig - amt;
      next.final = fmt(f);
      if (orig > 0) next.pct = fmtPct(((orig - f) / orig) * 100);
    } else if (orig !== null && fin !== null && changed === "original") {
      const a = orig - fin;
      next.amount = fmt(Math.max(0, a));
      if (orig > 0) next.pct = fmtPct((Math.max(0, a) / orig) * 100);
    }
  }

  if (changed === "final") {
    if (orig !== null && fin !== null) {
      const a = orig - fin;
      next.amount = fmt(Math.max(0, a));
      if (orig > 0) next.pct = fmtPct((Math.max(0, a) / orig) * 100);
    } else if (fin !== null && amt !== null) {
      const o = fin + amt;
      next.original = fmt(o);
      if (o > 0) next.pct = fmtPct((amt / o) * 100);
    } else if (fin !== null && pct !== null && pct < 100) {
      const o = fin / (1 - pct / 100);
      next.original = fmt(o);
      next.amount   = fmt(o - fin);
    }
  }

  if (changed === "amount") {
    if (orig !== null && amt !== null) {
      const f = orig - amt;
      next.final = fmt(Math.max(0, f));
      if (orig > 0) next.pct = fmtPct((amt / orig) * 100);
    } else if (fin !== null && amt !== null) {
      const o = fin + amt;
      next.original = fmt(o);
      if (o > 0) next.pct = fmtPct((amt / o) * 100);
    }
  }

  return next;
}

export function DiscountModal({ initialPrice, initialFinalPrice, onConfirm, onClose }: DiscountModalProps) {
  const origStr  = initialPrice      != null && !isNaN(initialPrice)      ? initialPrice.toFixed(2)      : "";
  const finalStr = initialFinalPrice != null && !isNaN(initialFinalPrice) ? initialFinalPrice.toFixed(2) : origStr;

  // Pre-calculate pct/amount when both prices are known on open
  const hasBoth = origStr !== "" && finalStr !== "" && origStr !== finalStr;
  const initOrig = parseFloat(origStr);
  const initFin  = parseFloat(finalStr);
  const initPct  = hasBoth && initOrig > 0 ? ((1 - initFin / initOrig) * 100).toFixed(1) : "";
  const initAmt  = hasBoth ? (initOrig - initFin).toFixed(2) : "";

  const [values, setValues] = useState<Record<Field, string>>({
    original: origStr,
    final:    finalStr,
    pct:      initPct,
    amount:   initAmt,
  });

  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  function handleChange(field: Field, raw: string) {
    const next = recalculate(field, { ...values, [field]: raw });
    setValues(next);
  }

  const orig = parseFloat(values.original);
  const fin  = parseFloat(values.final);
  const valid =
    !isNaN(orig) && orig > 0 &&
    !isNaN(fin)  && fin  > 0 &&
    fin <= orig;

  function handleConfirm() {
    if (!valid) return;
    onConfirm({ originalPrice: orig, finalPrice: fin });
  }

  const inputClass =
    "w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400";
  const labelClass = "mb-1 text-xs font-medium text-gray-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Add discount</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mb-4 text-xs text-gray-400">
          Fill any field — the others are calculated automatically.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {/* Original price */}
          <div>
            <p className={labelClass}>Price without discount</p>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
              <input
                ref={firstRef}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={values.original}
                onChange={(e) => handleChange("original", e.target.value)}
                className={`${inputClass} pl-7`}
              />
            </div>
          </div>

          {/* Final price */}
          <div>
            <p className={labelClass}>Price with discount</p>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-orange-400">€</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={values.final}
                onChange={(e) => handleChange("final", e.target.value)}
                className={`${inputClass} pl-7 ${
                  values.final && !isNaN(fin) && !isNaN(orig) && fin < orig
                    ? "border-orange-300 bg-orange-50"
                    : ""
                }`}
              />
            </div>
          </div>

          {/* Discount % */}
          <div>
            <p className={labelClass}>Percentage discount</p>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                max="100"
                placeholder="0"
                value={values.pct}
                onChange={(e) => handleChange("pct", e.target.value)}
                className={`${inputClass} pr-7`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
            </div>
          </div>

          {/* Discount amount */}
          <div>
            <p className={labelClass}>Amount discount</p>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={values.amount}
                onChange={(e) => handleChange("amount", e.target.value)}
                className={`${inputClass} pl-7`}
              />
            </div>
          </div>
        </div>

        {/* Summary */}
        {valid && (
          <div className="mt-4 rounded-xl bg-orange-50 px-4 py-3 text-center">
            <p className="text-xs text-gray-500">
              <span className="line-through">€{orig.toFixed(2)}</span>
              {" → "}
              <span className="font-bold text-orange-600">€{fin.toFixed(2)}</span>
              {orig > fin && (
                <span className="ml-2 text-emerald-600">
                  you save €{(orig - fin).toFixed(2)} ({Math.round((1 - fin / orig) * 100)}%)
                </span>
              )}
            </p>
          </div>
        )}

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!valid}
            className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
