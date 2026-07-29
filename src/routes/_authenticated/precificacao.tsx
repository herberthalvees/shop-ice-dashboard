import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/precificacao")({
  head: () => ({
    meta: [
      { title: "Precificação — Dream Ice" },
      { name: "description", content: "Calculadora de preço mínimo, margem e análise de custo por SKU." },
      { property: "og:title", content: "Precificação — Dream Ice" },
      { property: "og:description", content: "Calculadora de preço mínimo, margem e análise de custo por SKU." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});