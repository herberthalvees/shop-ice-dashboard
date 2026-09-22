import { useSyncExternalStore } from "react";

// Filtro global "Loja A / Loja B / Ambas" usado nas telas de relatório
// (Dashboard, Pedidos, Produtos, Financeiro, DRE, Precificação...).
// null = Ambas as lojas somadas (comportamento padrão, igual ao de antes
// deste filtro existir). Espelha o padrão de periodo-store.ts.
//
// Diferente de loja-store.ts (usado no Chat): lá sempre precisa de UMA
// loja específica pra saber qual conexão Shopee usar; aqui "todas" é uma
// opção válida porque é só leitura de relatório.

const STORAGE_KEY = "dreamice:loja-filtro";

function load(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === "todas") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

let state: number | null = load();
const listeners = new Set<() => void>();

function emit() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, state == null ? "todas" : String(state));
    } catch {
      /* noop */
    }
  }
  listeners.forEach((l) => l());
}

export const lojaFiltroStore = {
  get: () => state,
  set: (id: number | null) => {
    state = id;
    emit();
  },
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

export function useLojaFiltro() {
  const lojaId = useSyncExternalStore(
    lojaFiltroStore.subscribe,
    lojaFiltroStore.get,
    lojaFiltroStore.get,
  );
  return { lojaId, setLojaId: lojaFiltroStore.set };
}
