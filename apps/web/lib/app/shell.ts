import { useSyncExternalStore } from "react";

/**
 * What the Starlog app's shell said in its `hello` (AppMode asks once per page load): whether Google's consent tool (UMP)
 * requires a way to change the ad privacy choices, which 내 정보 then offers. False until the shell says so, and always on the
 * server and in a browser.
 */
let privacyOptionsRequired = false;
const listeners = new Set<() => void>();

export function setPrivacyOptionsRequired(value: boolean): void {
  if (value === privacyOptionsRequired) return;
  privacyOptionsRequired = value;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function usePrivacyOptionsRequired(): boolean {
  return useSyncExternalStore(subscribe, () => privacyOptionsRequired, () => false);
}

/** Tests only. */
export function resetShellForTests(): void {
  privacyOptionsRequired = false;
  listeners.clear();
}
