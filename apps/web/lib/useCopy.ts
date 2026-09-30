import { useCallback, useEffect, useRef, useState } from "react";

export type CopyState = "idle" | "copied" | "failed";

/** Copies text to the clipboard. `state` says how the last copy went and returns to idle after `resetMs`. */
export function useCopy(resetMs = 2000): { state: CopyState; copy: (text: string) => Promise<void> } {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setState("copied");
      } catch {
        setState("failed");
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState("idle"), resetMs);
    },
    [resetMs],
  );

  return { state, copy };
}
