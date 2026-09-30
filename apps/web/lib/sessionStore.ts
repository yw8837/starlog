import { useSyncExternalStore } from "react";

/**
 * One JSON value in sessionStorage (or localStorage) behind useSyncExternalStore, shared by every
 * hook that reads it. Falls back to memory when storage is blocked (private mode, a full quota).
 * Nothing here ever touches the URL.
 */
export interface SessionStore<T> {
  /** True when the value reached storage; false when it is only kept in memory (blocked or full). */
  save(value: T): boolean;
  /** False while the current value lives only in memory (it is lost when the tab closes). */
  persisted(): boolean;
  /** The saved value now (browser only), or null. */
  read(): T | null;
  /** Removes the saved value. */
  clear(): void;
  /** `undefined` until the browser snapshot is read (server render, hydration); `null` when nothing valid is saved. */
  useValue(): T | null | undefined;
}

type Area = "sessionStorage" | "localStorage";

function createStore<T>(area: Area, key: string, parse: (value: unknown) => T | null): SessionStore<T> {
  const listeners = new Set<() => void>();
  let memoryRaw: string | null = null;
  let cachedRaw: string | null | undefined;
  let cached: T | null = null;

  const storage = (): Storage => window[area];

  const readRaw = (): string | null => {
    if (memoryRaw !== null) return memoryRaw;
    try {
      return storage().getItem(key);
    } catch {
      return null;
    }
  };

  const decode = (raw: string | null): T | null => {
    if (!raw) return null;
    try {
      return parse(JSON.parse(raw));
    } catch {
      return null;
    }
  };

  const getSnapshot = (): T | null => {
    const raw = readRaw();
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cached = decode(raw);
    }
    return cached;
  };

  const getServerSnapshot = (): undefined => undefined;
  const notify = () => listeners.forEach((listener) => listener());

  // Another tab changed localStorage: re-read.
  const onStorage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) notify();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (area === "localStorage" && listeners.size === 1) window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      if (area === "localStorage" && listeners.size === 0) window.removeEventListener("storage", onStorage);
    };
  };

  return {
    save(value: T) {
      const raw = JSON.stringify(value);
      let stored = true;
      try {
        storage().setItem(key, raw);
        memoryRaw = null;
      } catch {
        memoryRaw = raw;
        stored = false;
      }
      notify();
      return stored;
    },
    persisted: () => memoryRaw === null,
    read: getSnapshot,
    clear() {
      memoryRaw = null;
      try {
        storage().removeItem(key);
      } catch {
        // Blocked storage: the memory copy above was all there was.
      }
      notify();
    },
    useValue() {
      return useSyncExternalStore<T | null | undefined>(subscribe, getSnapshot, getServerSnapshot);
    },
  };
}

/** Kept for this tab only (the question flow). */
export function createSessionStore<T>(key: string, parse: (value: unknown) => T | null): SessionStore<T> {
  return createStore("sessionStorage", key, parse);
}

/** Kept on this device across visits (readings, the saju profile, today's cookie). */
export function createLocalStore<T>(key: string, parse: (value: unknown) => T | null): SessionStore<T> {
  return createStore("localStorage", key, parse);
}
