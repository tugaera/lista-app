"use client";

import { useState } from "react";

const TABS = [
  { id: "users", label: "Users & Invites" },
  { id: "stores", label: "Stores" },
  { id: "products", label: "Products" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface AdminTabsProps {
  usersPanel: React.ReactNode;
  storesPanel: React.ReactNode;
  productsPanel: React.ReactNode;
}

export function AdminTabs({ usersPanel, storesPanel, productsPanel }: AdminTabsProps) {
  const [active, setActive] = useState<TabId>("users");

  return (
    <>
      {/* Tab bar */}
      <div className="mb-6 flex rounded-xl bg-gray-100 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors sm:text-sm ${
              active === tab.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panels */}
      <div className="space-y-6">
        {active === "users" && usersPanel}
        {active === "stores" && storesPanel}
        {active === "products" && productsPanel}
      </div>
    </>
  );
}
