import { useSyncExternalStore } from "react";

/**
 * One JSON value in sessionStorage behind useSyncExternalStore, shared by every hook that reads it.
 * Falls back to memory when storage is blocked (private mode). Nothing here ever touches the URL.
 */
export interface SessionStore<T> {
  save(value: T): void;
  /** `undefined` until the browser snapshot is read (server render, hydration); `null` when nothing valid is saved. */
  useValue(): T | null | undefined;
}

export function createSessionStore<T>(key: string, parse: (value: unknown) => T | null): SessionStore<T> {
  const listeners = new Set<() => void>();
  let memoryRaw: string | null = null;
  let cachedRaw: string | null | undefined;
  let cached: T | null = null;

  const readRaw = (): string | null => {
    if (memoryRaw !== null) return memoryRaw;
    try {
      return window.sessionStorage.getItem(key);
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

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    save(value: T) {
      const raw = JSON.stringify(value);
      try {
        window.sessionStorage.setItem(key, raw);
        memoryRaw = null;
      } catch {
        memoryRaw = raw;
      }
      listeners.forEach((listener) => listener());
    },
    useValue() {
      return useSyncExternalStore<T | null | undefined>(subscribe, getSnapshot, getServerSnapshot);
    },
  };
}
