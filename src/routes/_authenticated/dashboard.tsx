import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Dream Ice" },
      { name: "description", content: "Resumo de pedidos, faturamento, envio e estoque da loja Shopee." },
      { property: "og:title", content: "Dashboard — Dream Ice" },
      { property: "og:description", content: "Resumo de pedidos, faturamento, envio e estoque da loja Shopee." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});