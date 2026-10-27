import { useEffect, useState } from "react";
import { BOT_CHECK_EVENT } from "./turnstile";

/** True while the security check waits on the person's tick (lib/reading/turnstile.ts). */
export function useBotCheck(): boolean {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    const listen = (event: Event) => setWaiting((event as CustomEvent<boolean>).detail === true);
    window.addEventListener(BOT_CHECK_EVENT, listen);
    return () => window.removeEventListener(BOT_CHECK_EVENT, listen);
  }, []);
  return waiting;
}
