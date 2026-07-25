import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Dream Ice" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    conectado: s.conectado === "1" ? "1" : s.conectado === "0" ? "0" : undefined,
  }),
});