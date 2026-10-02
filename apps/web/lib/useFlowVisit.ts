import { useLayoutEffect, useRef, useState } from "react";
import { takeFlag, type FlowName } from "./freshStart";
import { lastRoute } from "./lastRoute";

/** Routes a move inside each flow comes from (the result's 질문 고치기 leads back into the tarot flow). */
const FLOW_ROUTES: Readonly<Record<FlowName, readonly string[]>> = {
  tarot: ["/tarot/new", "/tarot/new/situation", "/tarot/draw", "/tarot/result"],
  saju: ["/saju/new", "/saju/chart"],
};

/**
 * True when `from` (the route shown before) is another page of `flow` than `here`. A document's
 * first route (refresh, typed address, link from another site) has no route before it.
 */
export function cameFromFlow(flow: FlowName, from: string | null, here: string): boolean {
  return from !== null && from !== here && FLOW_ROUTES[flow].includes(from);
}

/**
 * A page of `flow` that keeps its answers only on a move inside the flow. Before its first paint,
 * `onEnter(inFlow)` says whether the route shown before was another page of the same flow (or the
 * address asks to keep with `?keep=1`, tests; `?new=1` never keeps and leaves the address). The
 * route before is read while the page first renders (lib/lastRoute.ts), so the decision does not
 * depend on the order the router mounts and unmounts pages; running it twice decides the same.
 */
export function useFlowVisit(flow: FlowName, onEnter: (inFlow: boolean) => void) {
  // The route before, as it was when this page first rendered.
  const [first] = useState(lastRoute);
  const shown = useRef(false);
  useLayoutEffect(() => {
    // Shown again later without a new render (a page kept by the router and brought back): the
    // route before is the one just left.
    const from = shown.current ? lastRoute() : first;
    const here = window.location.pathname;
    // StrictMode's dev replay runs after RouteTracker noted this very route: same showing, already decided.
    if (shown.current && from === here) return;
    shown.current = true;
    const keep = new URL(window.location.href).searchParams.has("keep");
    const fresh = takeFlag("new");
    onEnter(!fresh && (cameFromFlow(flow, from, here) || keep));
    // Once per time the page is shown: a re-render must not decide again.
  }, []);
}
