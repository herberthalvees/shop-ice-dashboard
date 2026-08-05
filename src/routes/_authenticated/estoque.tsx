import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque real — Dream Ice" },
      {
        name: "description",
        content:
          "Controle de estoque físico próprio, independente de Shopee e TikTok, com baixa automática por venda.",
      },
      { property: "og:title", content: "Estoque real — Dream Ice" },
      {
        property: "og:description",
        content: "Controle de estoque físico próprio com baixa automática por venda.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});