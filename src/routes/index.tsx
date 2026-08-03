import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/auth", replace: true });
  },
  head: () => ({
    meta: [
      { title: "Dream Ice — Redirecionando" },
      { name: "description", content: "Acesso ao painel privado Dream Ice para gestão da loja Shopee." },
      { property: "og:title", content: "Dream Ice — Redirecionando" },
      { property: "og:description", content: "Acesso ao painel privado Dream Ice para gestão da loja Shopee." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      <div className="flex items-center gap-3 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando…
      </div>
    </div>
  );
}
