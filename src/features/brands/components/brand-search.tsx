"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type BrandResult = {
  id: string;
  name: string;
};

type BrandSearchProps = {
  value: string;
  brandId: string | null;
  onChange: (name: string, id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function BrandSearch({ value, brandId: _brandId, onChange, placeholder, disabled }: BrandSearchProps) {
  const [results, setResults] = useState<BrandResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase
        .from("brands")
        .select("id, name")
        .ilike("name", `%${value}%`)
        .eq("is_active", true)
        .order("name")
        .limit(8);

      setResults(data ?? []);
      setIsOpen((data ?? []).length > 0);
      setIsLoading(false);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(brand: BrandResult) {
    onChange(brand.name, brand.id);
    setIsOpen(false);
    setResults([]);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value, null);
        }}
        onFocus={() => results.length > 0 && setIsOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-gray-50 disabled:text-gray-400"
      />
      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-emerald-500" />
        </div>
      )}
      {isOpen && (
        <div className="absolute left-0 right-0 bottom-full z-[70] mb-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((brand) => (
            <button
              key={brand.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(brand); }}
              className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-gray-50"
            >
              <span className="font-medium text-gray-900">{brand.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
