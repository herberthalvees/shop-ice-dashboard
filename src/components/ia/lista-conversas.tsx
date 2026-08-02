import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function ListaConversas({ ativa }: { ativa?: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["ia-conversas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ia_conversas")
        .select("id, titulo, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const { data: sessao } = await supabase.auth.getUser();
      const userId = sessao.user?.id;
      if (!userId) throw new Error("Sessão expirada, entre novamente.");
      const { data, error } = await supabase
        .from("ia_conversas")
        .insert({ titulo: "Nova conversa", user_id: userId })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: ["ia-conversas"] });
      navigate({ to: "/ia/$conversaId", params: { conversaId: id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ia_conversas").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: ["ia-conversas"] });
      if (id === ativa) navigate({ to: "/ia" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <aside className="flex w-full shrink-0 flex-col gap-2 md:w-64">
      <Button
        onClick={() => criar.mutate()}
        disabled={criar.isPending}
        className="w-full justify-start gap-2"
      >
        <Plus className="size-4" />
        Nova conversa
      </Button>

      <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto pr-1 md:max-h-[calc(100vh-14rem)]">
        {isLoading ? (
          <>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : !data?.length ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            Nenhuma conversa ainda. Crie a primeira acima.
          </p>
        ) : (
          data.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1 rounded-md border border-transparent pr-1 transition",
                c.id === ativa ? "border-primary/50 bg-primary/10" : "hover:bg-muted/60",
              )}
            >
              <Link
                to="/ia/$conversaId"
                params={{ conversaId: c.id }}
                className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-sm"
              >
                <MessageSquare className="size-3.5 shrink-0 text-primary" />
                <span className="truncate">{c.titulo || "Conversa"}</span>
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Excluir conversa"
                onClick={() => excluir.mutate(c.id)}
                className="opacity-0 transition group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}