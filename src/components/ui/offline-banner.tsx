"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useT } from "@/i18n/i18n-provider";

export function OfflineBanner() {
  const { t } = useT();
  const { isOnline } = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-50 flex items-center justify-center px-4 pb-2">
      <div className="flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-xs font-medium text-white shadow-lg">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728M5.636 5.636a9 9 0 000 12.728m12.728-9.9a6 6 0 010 7.07M8.464 8.464a6 6 0 000 7.07" />
        </svg>
        {t("offline.banner")}
      </div>
    </div>
  );
}
