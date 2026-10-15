import { useEffect, useState } from "react";

/**
 * Milliseconds since the calling component mounted, updated about every second. Read from the clock on
 * each tick (not counted ticks), so a tab left in the background shows the true time when it comes back.
 */
export function useElapsed(): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(timer);
  }, []);
  return elapsed;
}
