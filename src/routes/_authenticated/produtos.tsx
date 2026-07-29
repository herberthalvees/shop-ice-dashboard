import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/produtos")({
  validateSearch: (s: Record<string, unknown>) => ({ q: typeof s.q === "string" ? s.q : undefined }),
  head: () => ({
    meta: [
      { title: "Produtos — Dream Ice" },
      { name: "description", content: "Produtos, preços, status e alertas de estoque baixo da loja Shopee." },
      { property: "og:title", content: "Produtos — Dream Ice" },
      { property: "og:description", content: "Produtos, preços, status e alertas de estoque baixo da loja Shopee." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});