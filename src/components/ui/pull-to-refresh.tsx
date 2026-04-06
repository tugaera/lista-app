"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const THRESHOLD = 72; // px of pull needed to trigger refresh

export function PullToRefresh() {
  const router = useRouter();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    // Only activate on iOS PWA standalone mode
    const isIosStandalone =
      typeof window !== "undefined" &&
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (!isIosStandalone) return;

    function onTouchStart(e: TouchEvent) {
      if (window.scrollY !== 0) return;
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!isPulling.current) return;
      const delta = e.touches[0].clientY - touchStartY.current;
      if (delta <= 0) {
        isPulling.current = false;
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }
      // Dampen the pull so it doesn't extend too far
      const dampened = Math.min(delta * 0.45, THRESHOLD + 24);
      pullDistanceRef.current = dampened;
      setPullDistance(dampened);
      // Prevent the page from bouncing/scrolling while pulling
      e.preventDefault();
    }

    function onTouchEnd() {
      if (!isPulling.current) return;
      isPulling.current = false;

      if (pullDistanceRef.current >= THRESHOLD) {
        setIsRefreshing(true);
        setPullDistance(THRESHOLD); // hold indicator visible
        router.refresh();
        // Give router.refresh() time to complete before hiding indicator
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
          pullDistanceRef.current = 0;
        }, 1200);
      } else {
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [router]);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const visible = pullDistance > 4;

  if (!visible && !isRefreshing) return null;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-[100] flex justify-center"
      style={{ transform: `translateY(${Math.max(pullDistance - 40, -8)}px)`, transition: isRefreshing ? "transform 0.2s ease" : "none" }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md"
        style={{ opacity: progress }}
      >
        {isRefreshing ? (
          <svg className="h-5 w-5 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg
            className="h-5 w-5 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            style={{ transform: `rotate(${progress * 180}deg)`, transition: "none" }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
    </div>
  );
}
