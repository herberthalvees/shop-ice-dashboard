import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/calculadora")({
  head: () => ({
    meta: [
      { title: "Calculadora de Precificação — Dream Ice" },
      { name: "description", content: "Calcule comissão, impostos, custos e margem de lucro para vendas na Shopee." },
      { property: "og:title", content: "Calculadora de Precificação — Dream Ice" },
      { property: "og:description", content: "Calcule comissão, impostos, custos e margem de lucro para vendas na Shopee." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
