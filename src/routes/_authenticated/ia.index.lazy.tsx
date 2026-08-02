import { createLazyFileRoute } from "@tanstack/react-router";
import { Sparkle } from "lucide-react";
import { ListaConversas } from "@/components/ia/lista-conversas";

export const Route = createLazyFileRoute("/_authenticated/ia/")({
  component: IaIndex,
});

function IaIndex() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Dream IA</h1>
        <p className="text-sm text-muted-foreground">
          Pergunte em português e a IA consulta o banco do painel para responder com números reais.
        </p>
      </header>

      <div className="flex flex-col gap-4 md:flex-row">
        <ListaConversas />
        <div className="flex flex-1 items-center justify-center rounded-xl border bg-card/40 p-10 text-center">
          <div className="space-y-2">
            <Sparkle className="mx-auto size-8 text-primary" />
            <p className="font-medium">Escolha uma conversa ou crie uma nova</p>
            <p className="text-sm text-muted-foreground">
              Cada conversa guarda seu histórico e os aprendizados da IA sobre a sua loja.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}