import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({
    meta: [
      { title: "Notificações — Dream Ice" },
      { name: "description", content: "Configuração de webhooks e histórico de notificações da Shopee." },
      { property: "og:title", content: "Notificações — Dream Ice" },
      { property: "og:description", content: "Configuração de webhooks e histórico de notificações da Shopee." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});