import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/ia/$conversaId")({
  head: () => ({
    meta: [
      { title: "Analista IA — Dream Ice" },
      {
        name: "description",
        content: "Conversa com o Analista IA sobre os dados da sua loja Shopee.",
      },
      { property: "og:title", content: "Analista IA — Dream Ice" },
      {
        property: "og:description",
        content: "Conversa com o Analista IA sobre os dados da sua loja Shopee.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});