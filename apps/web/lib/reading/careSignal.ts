/**
 * 돌봄 모드 on the screen (owner 2026-10-31): a generation whose body says `care: true` (lib/api/stream.ts) signals
 * the one CareBanner in the root layout, so every reading screen gets the helplines without each one wiring them.
 */
const EVENT = "starlog:care";

export function signalCare(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

export function onCareSignal(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
