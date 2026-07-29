import { useSyncExternalStore } from "react";
import type { DateRange } from "react-day-picker";

export type Preset = "hoje" | "ontem" | "7d" | "30d" | "mes" | "ano" | "custom";

export type PeriodoState = {
  preset: Preset;
  custom?: { from?: string; to?: string };
};

const STORAGE_KEY = "dreamice:periodo";

function load(): PeriodoState {
  if (typeof window === "undefined") return { preset: "30d" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { preset: "30d" };
    const parsed = JSON.parse(raw) as PeriodoState;
    if (!parsed?.preset) return { preset: "30d" };
    return parsed;
  } catch {
    return { preset: "30d" };
  }
}

let state: PeriodoState = load();
const listeners = new Set<() => void>();

function emit() {
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* noop */ }
  }
  listeners.forEach((l) => l());
}

export const periodoStore = {
  get: () => state,
  set: (next: PeriodoState) => { state = next; emit(); },
  setPreset: (preset: Preset) => { state = { ...state, preset }; emit(); },
  setCustom: (range: DateRange | undefined) => {
    state = {
      ...state,
      custom: range
        ? { from: range.from?.toISOString(), to: range.to?.toISOString() }
        : undefined,
    };
    emit();
  },
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

export function usePeriodo() {
  const s = useSyncExternalStore(periodoStore.subscribe, periodoStore.get, periodoStore.get);
  const custom: DateRange | undefined = s.custom
    ? { from: s.custom.from ? new Date(s.custom.from) : undefined, to: s.custom.to ? new Date(s.custom.to) : undefined }
    : undefined;
  return {
    preset: s.preset,
    custom,
    setPreset: periodoStore.setPreset,
    setCustom: periodoStore.setCustom,
  };
}

export function computeRange(preset: Preset, custom?: DateRange): { de: Date; ate: Date } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (preset === "hoje") return { de: hoje, ate: hoje };
  if (preset === "ontem") {
    const o = new Date(hoje);
    o.setDate(o.getDate() - 1);
    return { de: o, ate: o };
  }
  if (preset === "7d") {
    const de = new Date(hoje);
    de.setDate(de.getDate() - 6);
    return { de, ate: hoje };
  }
  if (preset === "30d") {
    const de = new Date(hoje);
    de.setDate(de.getDate() - 29);
    return { de, ate: hoje };
  }
  if (preset === "mes") {
    const de = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { de, ate: hoje };
  }
  if (preset === "ano") {
    const de = new Date(hoje);
    de.setDate(de.getDate() - 364);
    return { de, ate: hoje };
  }
  const de = custom?.from ?? hoje;
  const ate = custom?.to ?? custom?.from ?? hoje;
  return { de, ate };
}