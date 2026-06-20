import { useSyncExternalStore } from "react";

// The teams a visitor has starred. Device-local only (no account/sync) — same
// storage approach as the bracket picks. A tiny external store backs a
// useSyncExternalStore hook so a star toggled anywhere (Teams rows, a team
// page) instantly updates every other view, including the Overview panel.

const KEY = "wc-favorites";
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// getSnapshot must return a stable reference between changes, so cache the
// parsed array and only replace it when the store actually changes.
let cache: string[] = read();

function emit() {
  cache = read();
  listeners.forEach((l) => l());
}

// Keep tabs/windows in sync — storage events fire only in *other* documents.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) emit();
  });
}

export function isFavorite(id: string): boolean {
  return cache.includes(id);
}

export function toggleFavorite(id: string): void {
  const next = cache.includes(id) ? cache.filter((x) => x !== id) : [...cache, id];
  localStorage.setItem(KEY, JSON.stringify(next));
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Reactive list of starred team ids, in the order they were added. */
export function useFavorites(): string[] {
  return useSyncExternalStore(subscribe, () => cache, () => cache);
}
