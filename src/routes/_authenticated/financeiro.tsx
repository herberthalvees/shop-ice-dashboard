import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — Dream Ice" },
      { name: "description", content: "Saldo, entradas, saídas e movimentações da carteira Shopee." },
      { property: "og:title", content: "Financeiro — Dream Ice" },
      { property: "og:description", content: "Saldo, entradas, saídas e movimentações da carteira Shopee." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});