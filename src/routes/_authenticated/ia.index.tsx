import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/ia/")({
  head: () => ({
    meta: [
      { title: "Dream IA — Dream Ice" },
      {
        name: "description",
        content: "Converse com o Dream IA e consulte pedidos, custos, ads e lucro da sua loja Shopee.",
      },
      { property: "og:title", content: "Dream IA — Dream Ice" },
      {
        property: "og:description",
        content: "Converse com o Dream IA e consulte pedidos, custos, ads e lucro da sua loja Shopee.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});