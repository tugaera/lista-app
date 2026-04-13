"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { syncPendingMutations } from "@/lib/offline/sync";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// Minimum time the app must have been hidden before a visibility-change
// refresh is triggered (avoids refreshing on trivial tab switches).
const VISIBILITY_REFRESH_AFTER_MS = 30_000; // 30 seconds

export function SyncManager() {
  const router = useRouter();
  const { isOnline } = useOnlineStatus();
  const wasOffline = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number } | null>(null);

  // ── Push pending offline mutations then pull fresh server state ──────────
  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      return;
    }

    async function doSync() {
      const supabase = createBrowserSupabaseClient();
      setSyncing(true);
      try {
        const result = await syncPendingMutations(supabase);
        if (result.synced > 0 || result.failed > 0) {
          setSyncResult(result);
          setTimeout(() => setSyncResult(null), 3000);
        }
      } catch (err) {
        console.error("[SyncManager] sync error:", err);
      } finally {
        setSyncing(false);
        wasOffline.current = false;
        // Always refresh server components after sync so shared-cart
        // partners see each other's changes (including what was added
        // while this user was offline).
        router.refresh();
      }
    }

    doSync();
  }, [isOnline, router]);

  // ── Refresh when app comes back to foreground ────────────────────────────
  // Handles: screen lock/unlock, app backgrounded, tab switch.
  // This is the main fix for shared-cart stale data after phone sleep.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === "visible") {
        const hiddenFor = hiddenAtRef.current
          ? Date.now() - hiddenAtRef.current
          : Infinity;
        hiddenAtRef.current = null;
        if (hiddenFor >= VISIBILITY_REFRESH_AFTER_MS) {
          router.refresh();
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [router]);

  if (!syncing && !syncResult) return null;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-50 flex items-center justify-center px-4 pb-2">
      <div className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-lg">
        {syncing ? (
          <>
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Syncing changes...
          </>
        ) : syncResult ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {syncResult.synced} change{syncResult.synced !== 1 ? "s" : ""} synced
            {syncResult.failed > 0 && ` (${syncResult.failed} failed)`}
          </>
        ) : null}
      </div>
    </div>
  );
}
