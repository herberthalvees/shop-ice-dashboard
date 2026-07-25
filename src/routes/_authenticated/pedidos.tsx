import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos — Dream Ice" },
      { name: "description", content: "Lista filtrável de pedidos sincronizados da Shopee no Dream Ice." },
      { property: "og:title", content: "Pedidos — Dream Ice" },
      { property: "og:description", content: "Lista filtrável de pedidos sincronizados da Shopee no Dream Ice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});