import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type PeriodoCusto = {
  id: number;
  custo_unitario: number;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  observacao: string | null;
};

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBR = (iso: string | null) =>
  iso == null ? "—" : format(new Date(`${iso}T12:00:00`), "dd/MM/yyyy");

export function HistoricoCustoSheet({
  open,
  onOpenChange,
  item_id,
  model_id,
  titulo,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item_id: number;
  model_id: number;
  titulo?: string | null;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const hoje = format(new Date(), "yyyy-MM-dd");
  const [valor, setValor] = useState("");
  const [inicio, setInicio] = useState(hoje);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const { data: periodos, isLoading } = useQuery({
    queryKey: ["produto-custos", item_id, model_id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produto_custos" as any)
        .select("id, custo_unitario, vigencia_inicio, vigencia_fim, observacao")
        .eq("item_id", item_id)
        .eq("model_id", model_id)
        .order("vigencia_inicio", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: Number(r.id),
        custo_unitario: Number(r.custo_unitario),
        vigencia_inicio: String(r.vigencia_inicio),
        vigencia_fim: r.vigencia_fim ? String(r.vigencia_fim) : null,
        observacao: r.observacao ?? null,
      })) as PeriodoCusto[];
    },
  });

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(valor.replace(",", "."));
    if (!Number.isFinite(num) || num < 0) {
      return toast.error("Custo inválido", { description: "Informe um valor numérico maior ou igual a zero." });
    }
    setSalvando(true);
    const { error } = await supabase.rpc("registrar_custo" as any, {
      p_item_id: item_id,
      p_model_id: model_id,
      p_custo: num,
      p_inicio: inicio || null,
      p_observacao: obs.trim() === "" ? null : obs.trim(),
    });
    setSalvando(false);
    if (error) return toast.error("Erro ao registrar custo", { description: error.message });
    toast.success("Custo registrado");
    setValor("");
    setObs("");
    qc.invalidateQueries({ queryKey: ["produto-custos", item_id, model_id] });
    onSaved?.();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Histórico de custo</SheetTitle>
          <SheetDescription className="line-clamp-2">{titulo ?? `#${item_id}`}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Períodos</div>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (periodos ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum custo registrado ainda.</p>
            ) : (
              <ul className="space-y-2">
                {(periodos ?? []).map((p) => {
                  const atual = p.vigencia_fim == null;
                  return (
                    <li
                      key={p.id}
                      className={cn(
                        "rounded-md border p-3",
                        atual && "border-primary/50 bg-primary/5",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold tabular-nums">{brl(p.custo_unitario)}</span>
                        {atual && (
                          <span className="rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                            atual
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {dataBR(p.vigencia_inicio)} — {p.vigencia_fim ? dataBR(p.vigencia_fim) : "em vigência"}
                      </div>
                      {p.observacao && (
                        <div className="mt-1 text-xs text-muted-foreground italic">{p.observacao}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <form onSubmit={registrar} className="space-y-3 border-t pt-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Registrar novo custo</div>
            <div className="space-y-2">
              <Label htmlFor="hc-valor">Valor (R$)</Label>
              <Input
                id="hc-valor"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hc-inicio">Início da vigência</Label>
              <Input id="hc-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hc-obs">Observação (opcional)</Label>
              <Input
                id="hc-obs"
                placeholder="ex.: aumento do fornecedor"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={salvando || valor.trim() === ""} className="w-full">
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar custo
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
