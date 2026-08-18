import { createFileRoute } from "@tanstack/react-router";

const descricao =
  "Campanhas de pós-venda da Dream Ice: públicos filtrados, cupons e envio controlado pelo chat da Shopee.";

export const Route = createFileRoute("/_authenticated/pos-venda")({
  head: () => ({
    meta: [
      { title: "Pós-venda — Dream Ice" },
      { name: "description", content: descricao },
      { property: "og:title", content: "Pós-venda — Dream Ice" },
      { property: "og:description", content: descricao },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
