import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/ia/")({
  head: () => ({
    meta: [
      { title: "Analista IA — Dream Ice" },
      {
        name: "description",
        content: "Converse com a IA e consulte pedidos, custos, ads e lucro da sua loja Shopee.",
      },
      { property: "og:title", content: "Analista IA — Dream Ice" },
      {
        property: "og:description",
        content: "Converse com a IA e consulte pedidos, custos, ads e lucro da sua loja Shopee.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});