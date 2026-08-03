import { useSyncExternalStore } from "react";

export type Marketplace = "todos" | "shopee" | "tiktok";

const STORAGE_KEY = "dreamice:marketplace";

function load(): Marketplace {
  if (typeof window === "undefined") return "todos";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "shopee" || raw === "tiktok" ? raw : "todos";
  } catch {
    return "todos";
  }
}

let state: Marketplace = load();
const listeners = new Set<() => void>();

export const marketplaceStore = {
  get: () => state,
  set: (next: Marketplace) => {
    state = next;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* noop */
      }
    }
    listeners.forEach((l) => l());
  },
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

export function useMarketplace() {
  const marketplace = useSyncExternalStore(
    marketplaceStore.subscribe,
    marketplaceStore.get,
    () => "todos" as Marketplace,
  );
  return { marketplace, setMarketplace: marketplaceStore.set };
}

/** Valor a usar em filtros de query: undefined = sem filtro (todos). */
export function filtroMarketplace(m: Marketplace): "shopee" | "tiktok" | undefined {
  return m === "todos" ? undefined : m;
}

export const ROTULOS_MARKETPLACE: Record<Marketplace, string> = {
  todos: "Todos os canais",
  shopee: "Shopee",
  tiktok: "TikTok Shop",
};