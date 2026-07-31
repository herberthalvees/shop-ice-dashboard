import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, CornerDownRight, Settings2, Plus, Trash2, Pencil, X, Check } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/_authenticated/dre")({
  component: DrePage,
});

const brl = (v: number | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number | null | undefined) => `${Number(v ?? 0).toFixed(1)}%`;

type Despesa = {
  id: number;
  descricao: string;
  valor: number;
  categoria: string | null;
  ativa: boolean;
};

type Variavel = {
  id: number;
  descricao: string;
  valor_por_pedido: number;
  franquia_pedidos: number | null;
  dia_corte_ciclo: number | null;
  ativa: boolean;
};

type VariavelDetalhe = {
  id: number;
  descricao: string;
  valor_por_pedido: number;
  franquia_pedidos: number | null;
  dia_corte_ciclo: number | null;
  pedidos_base: number;
  pedidos_cobrados: number;
  ciclo_inicio: string;
  ciclo_fim: string;
  valor: number;
};

function Linha({
  label,
  valor,
  tone = "default",
  badge,
  strong,
  hint,
}: {
  label: string;
  valor: number | null | undefined;
  tone?: "default" | "negative" | "positive" | "muted";
  badge?: React.ReactNode;
  strong?: boolean;
  hint?: string;
}) {
  const toneCls =
    tone === "negative"
      ? "text-destructive"
      : tone === "positive"
        ? "text-emerald-500"
        : tone === "muted"
          ? "text-muted-foreground"
          : "";
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className={`text-sm ${strong ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
        {badge}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <span className={`tabular-nums ${strong ? "text-base font-semibold" : "text-sm"} ${toneCls}`}>
        {brl(valor)}
      </span>
    </div>
  );
}

function DrePage() {
  const hoje = new Date();
  const [ref, setRef] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const ano = ref.getFullYear();
  const mes = ref.getMonth() + 1;

  const { data, isLoading } = useQuery({
    queryKey: ["dre-mensal", ano, mes],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dre_mensal", { p_ano: ano, p_mes: mes });
      if (error) throw error;
      return (data as any[])?.[0] ?? null;
    },
  });

  const { data: despesas } = useQuery({
    queryKey: ["despesas-fixas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despesas_fixas")
        .select("id, descricao, valor, categoria, ativa")
        .order("descricao");
      if (error) throw error;
      return (data ?? []) as Despesa[];
    },
  });

  const { data: variaveis } = useQuery({
    queryKey: ["despesas-variaveis"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("despesas_variaveis")
        .select("id, descricao, valor_por_pedido, franquia_pedidos, dia_corte_ciclo, ativa")
        .order("descricao");
      if (error) throw error;
      return (data ?? []) as Variavel[];
    },
  });

  const { data: variaveisDetalhe } = useQuery({
    queryKey: ["dre-variaveis-detalhe", ano, mes],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("dre_variaveis_detalhe", {
        p_ano: ano,
        p_mes: mes,
      });
      if (error) throw error;
      return (data ?? []) as VariavelDetalhe[];
    },
  });

  const ativas = (despesas ?? []).filter((d) => d.ativa);
  const mesLabel = format(ref, "MMMM yyyy", { locale: ptBR });
  const mover = (delta: number) => setRef(new Date(ano, ref.getMonth() + delta, 1));

  const lucro = Number(data?.lucro_liquido ?? 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DRE Mensal</h1>
          <p className="text-sm text-muted-foreground">Demonstrativo de resultado do exercício</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => mover(-1)} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[10rem] text-center text-sm font-medium capitalize">{mesLabel}</span>
          <Button variant="outline" size="icon" onClick={() => mover(1)} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Receita</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              <Linha label="Receita Bruta" valor={data?.receita_bruta} />
              <Linha label="(-) Cancelamentos" valor={data?.cancelamentos} tone="negative" />
              <Linha label="= Receita Líquida" valor={data?.receita_liquida} strong />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Custos</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              <Linha
                label="(-) Custo dos Produtos (CMV)"
                valor={data?.cmv}
                tone="negative"
                badge={<Badge variant="secondary">{pct(data?.cmv_pct)}</Badge>}
              />
              <div className="pt-2">
                <Linha
                  label="= Lucro Bruto"
                  valor={data?.lucro_bruto}
                  strong
                  badge={<Badge variant="secondary">{pct(data?.lucro_bruto_pct)}</Badge>}
                />
                <Progress
                  value={Math.max(0, Math.min(100, Number(data?.lucro_bruto_pct ?? 0)))}
                  className="mt-1 h-2 [&>div]:bg-emerald-500"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                Despesas Operacionais
              </CardTitle>
              <div className="flex items-center gap-2">
                <GerenciarVariaveis variaveis={variaveis ?? []} />
                <GerenciarDespesas despesas={despesas ?? []} />
              </div>
            </CardHeader>
            <CardContent className="divide-y">
              <Linha
                label="(-) Taxas do Marketplace"
                valor={data?.taxas_marketplace}
                tone="negative"
                badge={<Badge variant="secondary">{pct(data?.taxas_pct)}</Badge>}
              />
              <Linha
                label="(-) Publicidade (Ads)"
                valor={data?.ads}
                tone="negative"
                badge={<Badge variant="secondary">{pct(data?.ads_pct)}</Badge>}
              />
              <div className="py-2">
                <Linha
                  label="(-) Despesas Fixas"
                  valor={data?.despesas_fixas}
                  tone="negative"
                  badge={<Badge variant="secondary">{pct(data?.despesas_fixas_pct)}</Badge>}
                />
                {ativas.length > 0 && (
                  <div className="mt-1 space-y-1 pl-6">
                    {ativas.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <CornerDownRight className="h-3 w-3" />
                          {d.descricao}
                          {d.categoria && <span className="opacity-60">· {d.categoria}</span>}
                        </span>
                        <span className="tabular-nums">{brl(d.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="py-2">
                <Linha
                  label="(-) Despesas Variáveis (por pedido)"
                  valor={data?.despesas_variaveis}
                  tone="negative"
                  badge={<Badge variant="secondary">{pct(data?.despesas_variaveis_pct)}</Badge>}
                />
                {(variaveisDetalhe ?? []).length > 0 && (
                  <div className="mt-1 space-y-1 pl-6">
                    {(variaveisDetalhe ?? []).map((v) => (
                      <div key={v.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <CornerDownRight className="h-3 w-3" />
                          {v.descricao}
                          <span className="opacity-60">
                            · {v.pedidos_cobrados.toLocaleString("pt-BR")} de{" "}
                            {v.pedidos_base.toLocaleString("pt-BR")} pedidos ×{" "}
                            {brl(v.valor_por_pedido)}
                            {v.franquia_pedidos
                              ? ` (franquia ${v.franquia_pedidos.toLocaleString("pt-BR")}, ciclo ${format(new Date(v.ciclo_inicio + "T12:00:00"), "dd/MM")}–${format(new Date(v.ciclo_fim + "T12:00:00"), "dd/MM")})`
                              : ""}
                          </span>
                        </span>
                        <span className="tabular-nums">{brl(v.valor)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="pt-2">
                <Linha
                  label="= Resultado Operacional"
                  valor={data?.resultado_operacional}
                  strong
                  badge={<Badge variant="secondary">{pct(data?.resultado_operacional_pct)}</Badge>}
                />
                <Progress
                  value={Math.max(0, Math.min(100, Number(data?.resultado_operacional_pct ?? 0)))}
                  className="mt-1 h-2 [&>div]:bg-emerald-500"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Resultado Final</CardTitle>
            </CardHeader>
            <CardContent>
              <Linha
                label="(-) Impostos"
                valor={data?.impostos}
                tone="negative"
                badge={<Badge variant="secondary">{pct(data?.impostos_pct)}</Badge>}
              />
              <Separator className="my-3" />
              <div className="flex flex-wrap items-end justify-between gap-3">
                <span className="text-sm font-semibold uppercase tracking-wide">Lucro Líquido</span>
                <div className="flex items-center gap-3">
                  <Badge
                    className={lucro >= 0 ? "bg-emerald-500/15 text-emerald-500" : "bg-destructive/15 text-destructive"}
                    variant="secondary"
                  >
                    {pct(data?.lucro_liquido_pct)}
                  </Badge>
                  <span
                    className={`text-3xl font-bold tabular-nums ${lucro >= 0 ? "text-emerald-500" : "text-destructive"}`}
                  >
                    {brl(lucro)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function GerenciarDespesas({ despesas }: { despesas: Despesa[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [categoria, setCategoria] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["despesas-fixas"] });
    qc.invalidateQueries({ queryKey: ["dre-mensal"] });
  };

  const limpar = () => {
    setEditId(null);
    setDescricao("");
    setValor("");
    setCategoria("");
  };

  async function salvar() {
    const v = Number(valor.replace(",", "."));
    if (!descricao.trim() || !Number.isFinite(v)) {
      toast.error("Informe descrição e valor válidos");
      return;
    }
    setSaving(true);
    const payload = { descricao: descricao.trim(), valor: v, categoria: categoria.trim() || null };
    const { error } = editId
      ? await supabase.from("despesas_fixas").update(payload).eq("id", editId)
      : await supabase.from("despesas_fixas").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    toast.success(editId ? "Despesa atualizada" : "Despesa criada");
    limpar();
    refresh();
  }

  async function toggleAtiva(d: Despesa, ativa: boolean) {
    const { error } = await supabase.from("despesas_fixas").update({ ativa }).eq("id", d.id);
    if (error) return toast.error("Erro ao atualizar", { description: error.message });
    refresh();
  }

  async function remover(d: Despesa) {
    const { error } = await supabase.from("despesas_fixas").delete().eq("id", d.id);
    if (error) return toast.error("Erro ao excluir", { description: error.message });
    toast.success("Despesa excluída");
    if (editId === d.id) limpar();
    refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) limpar(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-2 h-4 w-4" />
          Gerenciar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Despesas fixas</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Contabilidade" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Valor (R$)</Label>
              <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="750,00" inputMode="decimal" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Administrativo" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={salvar} disabled={saving}>
              {editId ? <Check className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {editId ? "Salvar alterações" : "Adicionar"}
            </Button>
            {editId && (
              <Button size="sm" variant="ghost" onClick={limpar}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
            )}
          </div>
        </div>

        <Separator />

        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {despesas.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma despesa cadastrada.</p>
          )}
          {despesas.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{d.descricao}</p>
                <p className="text-xs text-muted-foreground">
                  {brl(d.valor)}
                  {d.categoria ? ` · ${d.categoria}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Switch checked={d.ativa} onCheckedChange={(v) => toggleAtiva(d, v)} aria-label="Ativa" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditId(d.id);
                    setDescricao(d.descricao);
                    setValor(String(d.valor).replace(".", ","));
                    setCategoria(d.categoria ?? "");
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remover(d)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}