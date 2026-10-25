"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Thin progress bar at the top of the window while a navigation is in flight.
 * Starts on same-origin link clicks and form GETs; ends when the URL changes.
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const current = `${pathname}?${search}`;
  const busy = busyFor !== null && busyFor === current;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setBusyFor(`${location.pathname}?${location.search.replace(/^\?/, "")}`);
    };
    const onNavigate = () => setBusyFor(`${location.pathname}?${location.search.replace(/^\?/, "")}`);
    document.addEventListener("click", onClick, true);
    window.addEventListener("app:navigate", onNavigate);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("app:navigate", onNavigate);
    };
  }, []);

  if (!busy) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden" role="progressbar" aria-label="Loading page">
      <div className="h-full w-full origin-left animate-progress bg-primary" />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense>
      <Bar />
    </Suspense>
  );
}

/** Lets programmatic navigations (filters, router.push) show the bar too. */
export function signalNavigation() {
  window.dispatchEvent(new Event("app:navigate"));
}
