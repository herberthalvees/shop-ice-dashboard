import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/ia/")({
  head: () => ({
    meta: [
      { title: "DreamAI — Dream Ice" },
      {
        name: "description",
        content: "Converse com o DreamAI e consulte pedidos, custos, ads e lucro da sua loja Shopee.",
      },
      { property: "og:title", content: "DreamAI — Dream Ice" },
      {
        property: "og:description",
        content: "Converse com o DreamAI e consulte pedidos, custos, ads e lucro da sua loja Shopee.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});