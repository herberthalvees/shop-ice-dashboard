import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Dream Ice" },
      { name: "description", content: "Conexão Shopee, sincronização manual e segurança da conta Dream Ice." },
      { property: "og:title", content: "Configurações — Dream Ice" },
      { property: "og:description", content: "Conexão Shopee, sincronização manual e segurança da conta Dream Ice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    conectado: s.conectado === "1" ? "1" : s.conectado === "0" ? "0" : undefined,
  }),
});