"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { noteRoute } from "@/lib/lastRoute";
import { pruneSajuTeasers } from "@/lib/reading/teaserCache";
import { pruneMatchPartners } from "@/lib/storage/chapters";

/**
 * Remembers the route on screen (lib/lastRoute.ts). A passive effect: it runs after every page's
 * render and layout effects of the same navigation, so those still see the route before.
 *
 * Also, whenever the app opens (once per page load), it drops the saju teasers kept on this device past
 * their time: their keys hold birth data, and the privacy policy says they are gone the next time
 * Starlog is opened (lib/reading/teaserCache.ts). The same goes for a 궁합's sealed partner past its 30 days
 * (lib/storage/chapters.ts pruneMatchPartners).
 */
export function RouteTracker() {
  const pathname = usePathname();
  useEffect(() => {
    noteRoute(pathname);
  }, [pathname]);
  useEffect(() => {
    pruneSajuTeasers();
    pruneMatchPartners();
  }, []);
  return null;
}
