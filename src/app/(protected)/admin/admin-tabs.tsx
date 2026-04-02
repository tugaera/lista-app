"use client";

import { useState } from "react";
import { useT } from "@/i18n/i18n-provider";

const TABS = [
  { id: "users", labelKey: "admin.users" as const },
  { id: "stores", labelKey: "admin.stores" as const },
  { id: "categories", labelKey: "admin.categories" as const },
  { id: "brands", labelKey: "admin.brands" as const },
  { id: "units", labelKey: "admin.units" as const },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface AdminTabsProps {
  usersPanel: React.ReactNode;
  storesPanel: React.ReactNode;
  categoriesPanel: React.ReactNode;
  brandsPanel: React.ReactNode;
  unitsPanel: React.ReactNode;
}

export function AdminTabs({ usersPanel, storesPanel, categoriesPanel, brandsPanel, unitsPanel }: AdminTabsProps) {
  const { t } = useT();
  const [active, setActive] = useState<TabId>("users");

  return (
    <>
      {/* Tab bar */}
      <div className="mb-6 flex rounded-xl bg-gray-100 p-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`flex-1 whitespace-nowrap rounded-lg py-2 text-xs font-medium transition-colors sm:text-sm ${
              active === tab.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Panels */}
      <div className="space-y-6">
        {active === "users" && usersPanel}
        {active === "stores" && storesPanel}
        {active === "categories" && categoriesPanel}
        {active === "brands" && brandsPanel}
        {active === "units" && unitsPanel}
      </div>
    </>
  );
}
