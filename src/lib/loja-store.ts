import { useSyncExternalStore } from "react";

// Loja selecionada nas telas que ainda operam sobre uma única loja por vez
// (ex: Chat, que precisa saber qual conexão Shopee usar pra enviar mensagem).
// Espelha o padrão de periodo-store.ts. null = nenhuma loja escolhida ainda
// (a tela deve usar a primeira loja ativa como padrão até o usuário trocar).

const STORAGE_KEY = "dreamice:loja-atual";

function load(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
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
      if (state == null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, String(state));
    } catch {
      /* noop */
    }
  }
  listeners.forEach((l) => l());
}

export const lojaStore = {
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

export function useLojaAtual() {
  const lojaId = useSyncExternalStore(lojaStore.subscribe, lojaStore.get, lojaStore.get);
  return { lojaId, setLojaId: lojaStore.set };
}
