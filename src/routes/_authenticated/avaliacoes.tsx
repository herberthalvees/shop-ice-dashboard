import { createFileRoute } from "@tanstack/react-router";

const descricao =
  "Avaliações da sua loja Shopee com respostas geradas pelo DreamAI e envio automático.";

export const Route = createFileRoute("/_authenticated/avaliacoes")({
  head: () => ({
    meta: [
      { title: "Avaliações — Dream Ice" },
      { name: "description", content: descricao },
      { property: "og:title", content: "Avaliações — Dream Ice" },
      { property: "og:description", content: descricao },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
