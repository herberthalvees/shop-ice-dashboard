import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/ia/$conversaId")({
  head: () => ({
    meta: [
      { title: "Dream IA — Dream Ice" },
      {
        name: "description",
        content: "Conversa com o Dream IA sobre os dados da sua loja Shopee.",
      },
      { property: "og:title", content: "Dream IA — Dream Ice" },
      {
        property: "og:description",
        content: "Conversa com o Dream IA sobre os dados da sua loja Shopee.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});