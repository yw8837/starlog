/**
 * The route on screen before the current one (this tab's JS only: null on a document's first route,
 * so a refresh, a typed address or a link from another site has none). Written by RouteTracker
 * (components/layout/RouteTracker.tsx) in a passive effect after each navigation, so a page reading
 * it while it renders or mounts still sees the route it came from, whatever order the router
 * mounts the new page and takes the old one away.
 */
let shown: string | null = null;

/** The pathname of the route shown before this one, or null on the document's first route. */
export const lastRoute = (): string | null => shown;

/** RouteTracker: the route now on screen. */
export function noteRoute(pathname: string) {
  shown = pathname;
}

/** Tests: start like a fresh document. */
export function forgetRoutes() {
  shown = null;
}
