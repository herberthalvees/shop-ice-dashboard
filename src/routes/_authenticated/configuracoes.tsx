import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Dream Ice" },
      { name: "description", content: "Conexão Shopee, sincronização manual e segurança da conta Dream Ice." },
      { property: "og:title", content: "Configurações — Dream Ice" },
      { property: "og:description", content: "Conexão Shopee, sincronização manual e segurança da conta Dream Ice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    conectado: s.conectado === "1" ? "1" : s.conectado === "0" ? "0" : undefined,
  }),
  errorComponent: ({ error, reset }) => (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-lg font-semibold">Não foi possível carregar as configurações</h1>
      <p className="text-sm text-muted-foreground">{error?.message ?? "Erro inesperado."}</p>
      <button
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Tentar novamente
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="py-16 text-center text-sm text-muted-foreground">Página não encontrada.</div>
  ),
});