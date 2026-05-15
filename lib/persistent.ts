"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const FAVORITES_KEY = "airwaves.favorites.v1";
const RECENT_KEY = "airwaves.recents.v1";
const RECENT_MAX = 20;

// `storage` events only fire across tabs, so we also dispatch a custom
// event for same-tab updates. Every reader subscribes to both.
const SAME_TAB_EVENT = "airwaves-local";

interface SameTabDetail {
  key: string;
}

function readList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, items: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent<SameTabDetail>(SAME_TAB_EVENT, { detail: { key } }));
  } catch {
    // localStorage quota / disabled — not fatal
  }
}

// Cache the latest snapshot per key so useSyncExternalStore returns a
// stable reference for unchanged data, avoiding spurious re-renders.
const snapshotCache = new Map<string, string>();

function getSnapshot(key: string): string {
  if (typeof window === "undefined") return "[]";
  const raw = window.localStorage.getItem(key) ?? "[]";
  const cached = snapshotCache.get(key);
  if (cached === raw) return cached;
  snapshotCache.set(key, raw);
  return raw;
}

function getServerSnapshot(): string {
  return "[]";
}

function subscribe(key: string) {
  return (notify: () => void) => {
    function onStorage(e: StorageEvent) {
      if (e.key === key) notify();
    }
    function onSameTab(e: Event) {
      const ev = e as CustomEvent<SameTabDetail>;
      if (ev.detail?.key === key) notify();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(SAME_TAB_EVENT, onSameTab as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SAME_TAB_EVENT, onSameTab as EventListener);
    };
  };
}

function useLocalList(key: string): string[] {
  const raw = useSyncExternalStore(subscribe(key), () => getSnapshot(key), getServerSnapshot);
  return useMemo(() => {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }, [raw]);
}

/**
 * Starred station UUIDs persisted to localStorage. Backed by
 * useSyncExternalStore so updates are reflected across components and
 * across tabs without any cascading-render warnings from React.
 */
export function useFavorites(): {
  favorites: Set<string>;
  toggleFavorite: (uuid: string) => void;
  isFavorite: (uuid: string) => boolean;
} {
  const list = useLocalList(FAVORITES_KEY);
  const favorites = useMemo(() => new Set(list), [list]);

  const toggleFavorite = useCallback((uuid: string) => {
    const current = readList(FAVORITES_KEY);
    const next = current.includes(uuid) ? current.filter((id) => id !== uuid) : [uuid, ...current];
    writeList(FAVORITES_KEY, next);
  }, []);

  const isFavorite = useCallback((uuid: string) => favorites.has(uuid), [favorites]);

  return { favorites, toggleFavorite, isFavorite };
}

/**
 * Most-recently-played station UUIDs, newest first, deduplicated, capped.
 */
export function useRecents(): {
  recents: string[];
  recordPlay: (uuid: string) => void;
  clearRecents: () => void;
} {
  const recents = useLocalList(RECENT_KEY);

  const recordPlay = useCallback((uuid: string) => {
    const current = readList(RECENT_KEY);
    const next = [uuid, ...current.filter((id) => id !== uuid)].slice(0, RECENT_MAX);
    writeList(RECENT_KEY, next);
  }, []);

  const clearRecents = useCallback(() => {
    writeList(RECENT_KEY, []);
  }, []);

  return { recents, recordPlay, clearRecents };
}
