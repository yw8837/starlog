"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { noteRoute } from "@/lib/lastRoute";

/**
 * Remembers the route on screen (lib/lastRoute.ts). A passive effect: it runs after every page's
 * render and layout effects of the same navigation, so those still see the route before.
 */
export function RouteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    noteRoute(pathname);
  }, [pathname]);
  return null;
}
