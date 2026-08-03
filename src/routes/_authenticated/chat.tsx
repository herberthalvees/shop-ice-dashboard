import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat Shopee — Dream Ice" },
      { name: "description", content: "Responda compradores da Shopee com textos prontos e histórico de conversas." },
      { property: "og:title", content: "Chat Shopee — Dream Ice" },
      { property: "og:description", content: "Responda compradores da Shopee com textos prontos e histórico de conversas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
