import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/ia/$conversaId")({
  head: () => ({
    meta: [
      { title: "DreamAI — Dream Ice" },
      {
        name: "description",
        content: "Conversa com o DreamAI sobre os dados da sua loja Shopee.",
      },
      { property: "og:title", content: "DreamAI — Dream Ice" },
      {
        property: "og:description",
        content: "Conversa com o DreamAI sobre os dados da sua loja Shopee.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});