import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  // During SSR assume the user is online so that the initial render
  // doesn't hide online-only UI.
  return true;
}

/**
 * React hook that tracks browser connectivity.
 *
 * Uses `useSyncExternalStore` so it is safe for SSR and concurrent
 * rendering.  The returned value updates synchronously when the browser
 * fires the `online` / `offline` window events.
 */
export function useOnlineStatus(): { isOnline: boolean } {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { isOnline };
}
