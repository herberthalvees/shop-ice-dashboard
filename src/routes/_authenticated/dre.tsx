import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dre")({
  head: () => ({
    meta: [
      { title: "DRE Mensal — Dream Ice" },
      { name: "description", content: "Demonstrativo de resultado mensal: receita, CMV, taxas, despesas fixas e lucro líquido." },
      { property: "og:title", content: "DRE Mensal — Dream Ice" },
      { property: "og:description", content: "Demonstrativo de resultado mensal: receita, CMV, taxas, despesas fixas e lucro líquido." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});