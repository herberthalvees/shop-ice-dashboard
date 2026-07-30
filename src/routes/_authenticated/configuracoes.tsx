import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

function ConfiguracoesError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-lg font-semibold">Não foi possível carregar as configurações</h1>
      <p className="text-sm text-muted-foreground">{error?.message ?? "Erro inesperado."}</p>
      <Button onClick={() => { void router.invalidate(); reset(); }}>
        Tentar novamente
      </Button>
    </div>
  );
}

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
    erro: typeof s.erro === "string" ? s.erro : undefined,
  }),
  errorComponent: ConfiguracoesError,
  notFoundComponent: () => (
    <div className="py-16 text-center text-sm text-muted-foreground">Página não encontrada.</div>
  ),
});