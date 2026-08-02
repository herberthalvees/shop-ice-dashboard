import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import { ChatIA } from "@/components/ia/chat-ia";
import { ListaConversas } from "@/components/ia/lista-conversas";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

export const Route = createLazyFileRoute("/_authenticated/ia/$conversaId")({
  component: IaConversa,
});

function IaConversa() {
  const { conversaId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["ia-mensagens", conversaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ia_mensagens")
        .select("msg_id, role, parts, created_at")
        .eq("conversa_id", conversaId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(
        (m, i) =>
          ({
            id: m.msg_id ?? `${conversaId}-${i}`,
            role: m.role,
            parts: m.parts,
          }) as UIMessage,
      );
    },
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Dream IA</h1>
        <p className="text-sm text-muted-foreground">
          Consultas em tempo real no banco do painel: pedidos, custos, ads, carteira e DRE.
        </p>
      </header>

      <div className="flex flex-col gap-4 md:flex-row">
        <ListaConversas ativa={conversaId} />
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <Skeleton className="h-[calc(100vh-10rem)] w-full rounded-xl" />
          ) : (
            <ChatIA key={conversaId} conversaId={conversaId} mensagensIniciais={data ?? []} />
          )}
        </div>
      </div>
    </div>
  );
}