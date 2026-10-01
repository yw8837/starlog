import { useLayoutEffect, useRef } from "react";
import { takeFlag, type FlowName } from "./freshStart";

/**
 * Which flow page was left last, where it was and when (this tab's JS only: a refresh forgets it).
 * A page of a flow records itself when it goes away; the next page of the same flow, shown in the
 * same move, reads it. That covers links, pushes and browser back/forward alike, with no address
 * change. Coming back to the very page that was left (home, then back) is not a move inside the flow.
 */
let left: { flow: FlowName; path: string; at: number; page: symbol } | null = null;

/** The page shown next in the same move comes right after: a later visit is a new start. */
const SAME_MOVE_MS = 2_000;

/** As if a page of `flow` at `path` was just left (the hook's cleanup; tests). */
export function leaveFlowPage(flow: FlowName, path = "/elsewhere-in-flow", page: symbol = Symbol("page")) {
  left = { flow, path, at: performance.now(), page };
}

/** Forgets the last page left (tests: each starts like a fresh tab). */
export function forgetFlowPages() {
  left = null;
}

/**
 * A page of `flow`. Before its first paint, `onEnter(inFlow)` is told whether it was reached from
 * another page of the same flow in this move, or asked to keep with `?keep=1` (tests; it stays in
 * the address). `?new=1` never keeps and is dropped from the address. React's StrictMode replay (the
 * same page left and shown again at once) is not a new visit.
 */
export function useFlowVisit(flow: FlowName, onEnter?: (inFlow: boolean) => void) {
  const page = useRef<symbol>(Symbol("page"));
  const enter = useRef(onEnter);
  enter.current = onEnter;
  useLayoutEffect(() => {
    const now = performance.now();
    const path = window.location.pathname;
    const last = left;
    left = null;
    const replay = last?.page === page.current && now - last.at < 50;
    if (!replay && enter.current) {
      const fromFlow = Boolean(last && last.flow === flow && last.path !== path && now - last.at < SAME_MOVE_MS);
      const keep = new URL(window.location.href).searchParams.has("keep");
      const fresh = takeFlag("new");
      enter.current(!fresh && (fromFlow || keep));
    }
    return () => leaveFlowPage(flow, path, page.current);
  }, [flow]);
}
