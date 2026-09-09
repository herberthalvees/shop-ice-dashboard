import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Clock, Plus, Trash2, Loader2 } from "lucide-react";

type Horario = {
  id: string;
  tipo: "parcial" | "fechamento";
  hora: number;
  minuto: number;
  ativo: boolean;
};

function paraTexto(h: Horario) {
  return `${String(h.hora).padStart(2, "0")}:${String(h.minuto).padStart(2, "0")}`;
}

export function ResumoHorarios() {
  const qc = useQueryClient();
  const [novo, setNovo] = useState("");

  const { data: horarios = [], isLoading } = useQuery<Horario[]>({
    queryKey: ["resumo-horarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resumo_horarios" as any)
        .select("id, tipo, hora, minuto, ativo")
        .order("tipo", { ascending: false })
        .order("hora", { ascending: true })
        .order("minuto", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Horario[];
    },
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ["resumo-horarios"] });

  const salvar = useMutation({
    mutationFn: async (input: { id: string; hora?: number; minuto?: number; ativo?: boolean }) => {
      const { id, ...campos } = input;
      const { error } = await supabase
        .from("resumo_horarios" as any)
        .update(campos as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Horário atualizado");
      invalidar();
    },
    onError: (e: any) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const criar = useMutation({
    mutationFn: async (texto: string) => {
      const [h, m] = texto.split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) throw new Error("Informe um horário válido.");
      const { error } = await supabase
        .from("resumo_horarios" as any)
        .insert({ tipo: "parcial", hora: h, minuto: m } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Horário incluído");
      setNovo("");
      invalidar();
    },
    onError: (e: any) =>
      toast.error("Não foi possível incluir", {
        description: e.message?.includes("duplicate") ? "Esse horário já existe." : e.message,
      }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resumo_horarios" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Horário removido");
      invalidar();
    },
    onError: (e: any) => toast.error("Não foi possível remover", { description: e.message }),
  });

  const parciais = horarios.filter((h) => h.tipo === "parcial");
  const fechamento = horarios.find((h) => h.tipo === "fechamento") ?? null;

  function alterarHora(h: Horario, texto: string) {
    const [hora, minuto] = texto.split(":").map(Number);
    if (!Number.isFinite(hora) || !Number.isFinite(minuto)) return;
    if (hora === h.hora && minuto === h.minuto) return;
    salvar.mutate({ id: h.id, hora, minuto });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Horários dos resumos no WhatsApp
        </CardTitle>
        <CardDescription>
          Parciais do dia de hoje e o fechamento do dia anterior. Horário de Brasília; a alteração
          passa a valer imediatamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <div className="space-y-3">
              <p className="text-sm font-medium">Parciais do dia</p>
              {parciais.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum parcial configurado.</p>
              )}
              {parciais.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <Input
                    type="time"
                    defaultValue={paraTexto(h)}
                    onBlur={(e) => alterarHora(h, e.target.value)}
                    className="w-28"
                    aria-label="Horário do parcial"
                  />
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={h.ativo}
                      onCheckedChange={(v) => salvar.mutate({ id: h.id, ativo: v })}
                      aria-label="Ativar horário"
                    />
                    <span className="text-sm text-muted-foreground">
                      {h.ativo ? "Ativo" : "Pausado"}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto text-destructive"
                    onClick={() => remover.mutate(h.id)}
                    disabled={remover.isPending}
                    aria-label="Remover horário"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <form
                className="flex flex-wrap items-center gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (novo) criar.mutate(novo);
                }}
              >
                <Input
                  type="time"
                  value={novo}
                  onChange={(e) => setNovo(e.target.value)}
                  className="w-28"
                  aria-label="Novo horário"
                />
                <Button type="submit" variant="outline" disabled={!novo || criar.isPending}>
                  {criar.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Incluir horário
                </Button>
              </form>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Fechamento do dia anterior</p>
              {fechamento ? (
                <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <Input
                    type="time"
                    defaultValue={paraTexto(fechamento)}
                    onBlur={(e) => alterarHora(fechamento, e.target.value)}
                    className="w-28"
                    aria-label="Horário do fechamento"
                  />
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={fechamento.ativo}
                      onCheckedChange={(v) => salvar.mutate({ id: fechamento.id, ativo: v })}
                      aria-label="Ativar fechamento"
                    />
                    <span className="text-sm text-muted-foreground">
                      {fechamento.ativo ? "Ativo" : "Pausado"}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Fechamento não configurado.</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
