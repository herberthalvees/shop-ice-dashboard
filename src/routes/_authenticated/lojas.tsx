import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

function LojasError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-lg font-semibold">Não foi possível carregar as lojas</h1>
      <p className="text-sm text-muted-foreground">{error?.message ?? "Erro inesperado."}</p>
      <Button
        onClick={() => {
          void router.invalidate();
          reset();
        }}
      >
        Tentar novamente
      </Button>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/lojas")({
  head: () => ({
    meta: [
      { title: "Lojas — Dream Ice" },
      {
        name: "description",
        content: "Cadastre e conecte as lojas Shopee que alimentam o Dream Ice.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    conectado: s.conectado === "1" ? "1" : s.conectado === "0" ? "0" : undefined,
    erro: typeof s.erro === "string" ? s.erro : undefined,
  }),
  errorComponent: LojasError,
  notFoundComponent: () => (
    <div className="py-16 text-center text-sm text-muted-foreground">Página não encontrada.</div>
  ),
});
