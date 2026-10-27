import { useEffect, useRef, useState } from "react";

/**
 * Milliseconds since the calling component mounted, updated about every second. Read from the clock on
 * each tick (not counted ticks), so a tab left in the background shows the true time when it comes back.
 * `paused` (the security check waiting on the person) stops it; it then counts on from where it stood.
 */
export function useElapsed(paused = false): number {
  const [elapsed, setElapsed] = useState(0);
  const banked = useRef(0);
  useEffect(() => {
    if (paused) return;
    const start = Date.now() - banked.current;
    const timer = setInterval(() => {
      banked.current = Date.now() - start;
      setElapsed(banked.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [paused]);
  return elapsed;
}
