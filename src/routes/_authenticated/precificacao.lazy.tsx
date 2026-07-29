import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, TrendingDown, AlertTriangle, HelpCircle, Calculator } from "lucide-react";
import { toast } from "sonner";

export const Route = createLazyFileRoute("/_authenticated/precificacao")({
  component: PrecificacaoPage,
});

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toISO = (d: Date) => format(d, "yyyy-MM-dd");
const fmtBR = (d: Date) => format(d, "dd/MM/yyyy");

type Preset = "hoje" | "ontem" | "7d" | "30d" | "custom";

function computeRange(preset: Preset, custom?: DateRange): { de: Date; ate: Date } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (preset === "hoje") return { de: hoje, ate: hoje };
  if (preset === "ontem") {
    const o = new Date(hoje);
    o.setDate(o.getDate() - 1);
    return { de: o, ate: o };
  }
  if (preset === "7d") {
    const de = new Date(hoje);
    de.setDate(de.getDate() - 6);
    return { de, ate: hoje };
  }
  if (preset === "30d") {
    const de = new Date(hoje);
    de.setDate(de.getDate() - 29);
    return { de, ate: hoje };
  }
  const de = custom?.from ?? hoje;
  const ate = custom?.to ?? custom?.from ?? hoje;
  return { de, ate };
}

type LinhaMargem = {
  sku: string;
  produto: string | null;
  unidades: number;
  preco_medio: number;
  custo_unitario: number | null;
  liquido_unitario: number;
  lucro_unitario: number | null;
  margem_pct: number | null;
  preco_minimo: number | null;
  situacao: "prejuizo" | "margem baixa" | "sem custo" | "ok";
};

function PrecificacaoPage() {
  const qc = useQueryClient();
  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState<DateRange | undefined>();
  const [customOpen, setCustomOpen] = useState(false);
  const [somentePrejuizo, setSomentePrejuizo] = useState(false);
  const { de, ate } = useMemo(() => computeRange(preset, custom), [preset, custom]);
  const p_de = toISO(de);
  const p_ate = toISO(ate);
  const rangeLabel = de.getTime() === ate.getTime() ? fmtBR(de) : `${fmtBR(de)} a ${fmtBR(ate)}`;

  const { data: linhas, isLoading } = useQuery({
    queryKey: ["analise-margem", p_de, p_ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analise_margem_sku" as any, { p_de, p_ate });
      if (error) throw error;
      return ((data as any[]) ?? []).map((r) => ({
        sku: String(r.sku ?? ""),
        produto: r.produto ?? null,
        unidades: Number(r.unidades ?? 0),
        preco_medio: Number(r.preco_medio ?? 0),
        custo_unitario: r.custo_unitario == null ? null : Number(r.custo_unitario),
        liquido_unitario: Number(r.liquido_unitario ?? 0),
        lucro_unitario: r.lucro_unitario == null ? null : Number(r.lucro_unitario),
        margem_pct: r.margem_pct == null ? null : Number(r.margem_pct),
        preco_minimo: r.preco_minimo == null ? null : Number(r.preco_minimo),
        situacao: String(r.situacao ?? "sem custo") as LinhaMargem["situacao"],
      })) as LinhaMargem[];
    },
  });

  const filtradas = useMemo(() => {
    if (!linhas) return [];
    if (somentePrejuizo) return linhas.filter((l) => l.situacao === "prejuizo");
    return linhas;
  }, [linhas, somentePrejuizo]);

  const resumo = useMemo(() => {
    if (!linhas) return { skusPrejuizo: 0, perdaTotal: 0, skusSemCusto: 0 };
    let skusPrejuizo = 0;
    let perdaTotal = 0;
    let skusSemCusto = 0;
    for (const l of linhas) {
      if (l.situacao === "prejuizo" && l.lucro_unitario != null) {
        skusPrejuizo += 1;
        perdaTotal += l.lucro_unitario * l.unidades;
      }
      if (l.situacao === "sem custo") skusSemCusto += 1;
    }
    return { skusPrejuizo, perdaTotal, skusSemCusto };
  }, [linhas]);

  async function salvarCusto(sku: string, valorStr: string) {
    const parsed = valorStr.trim() === "" ? null : Number(valorStr.replace(",", "."));
    if (parsed != null && (Number.isNaN(parsed) || parsed < 0)) {
      toast.error("Custo inválido");
      return;
    }
    const { error } = await supabase
      .from("dim_produto")
      .upsert(
        { sku, custo_unitario: parsed, atualizado_em: new Date().toISOString() } as any,
        { onConflict: "sku" },
      );
    if (error) {
      toast.error("Erro ao salvar custo", { description: error.message });
      return;
    }
    toast.success("Custo atualizado");
    qc.invalidateQueries({ queryKey: ["analise-margem"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Precificação</h1>
          <p className="text-sm text-muted-foreground">Análise de margem e preço mínimo por SKU · {rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="ontem">Ontem</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <Popover open={customOpen} onOpenChange={setCustomOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {custom?.from ? rangeLabel : "Escolher datas"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0 bg-popover">
                <Calendar mode="range" numberOfMonths={2} selected={custom} onSelect={setCustom} locale={ptBR} />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Calculadora avulsa */}
      <CalculadoraAvulsa />

      {/* Cards resumo */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">SKUs em prejuízo</CardTitle>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{resumo.skusPrejuizo}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">Perda estimada no período</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-destructive">
              {brl(resumo.perdaTotal)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm text-muted-foreground">SKUs sem custo</CardTitle>
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{resumo.skusSemCusto}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Análise por SKU</CardTitle>
          <div className="flex items-center gap-2">
            <Switch id="prej" checked={somentePrejuizo} onCheckedChange={setSomentePrejuizo} />
            <Label htmlFor="prej" className="text-sm">Mostrar apenas prejuízo</Label>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtradas.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Sem dados no período.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">SKU</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Unid.</TableHead>
                    <TableHead className="text-right">Preço médio</TableHead>
                    <TableHead className="text-right w-[130px]">Custo</TableHead>
                    <TableHead className="text-right">Líquido/u</TableHead>
                    <TableHead className="text-right">Lucro/u</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                    <TableHead className="text-right">Preço mín.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((l) => (
                    <LinhaSKU key={l.sku} linha={l} onSalvar={salvarCusto} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LinhaSKU({ linha, onSalvar }: { linha: LinhaMargem; onSalvar: (sku: string, v: string) => void | Promise<void> }) {
  const [valor, setValor] = useState<string>(linha.custo_unitario == null ? "" : String(linha.custo_unitario));
  const rowClass =
    linha.situacao === "prejuizo" ? "bg-destructive/10 hover:bg-destructive/15"
    : linha.situacao === "margem baixa" ? "bg-[color:var(--warning,theme(colors.amber.500))]/10 hover:bg-[color:var(--warning,theme(colors.amber.500))]/15"
    : "";
  const margemClass =
    linha.situacao === "prejuizo" ? "text-destructive font-medium"
    : linha.situacao === "margem baixa" ? "text-amber-500 font-medium"
    : "";
  return (
    <TableRow className={rowClass}>
      <TableCell className="font-mono text-xs">{linha.sku}</TableCell>
      <TableCell className="max-w-[280px] truncate" title={linha.produto ?? ""}>{linha.produto ?? "—"}</TableCell>
      <TableCell className="text-right">{linha.unidades.toLocaleString("pt-BR")}</TableCell>
      <TableCell className="text-right">{brl(linha.preco_medio)}</TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={valor}
          placeholder={linha.situacao === "sem custo" ? "informar" : ""}
          onChange={(e) => setValor(e.target.value)}
          onBlur={() => {
            const currentStr = linha.custo_unitario == null ? "" : String(linha.custo_unitario);
            if (valor !== currentStr) onSalvar(linha.sku, valor);
          }}
          className={`h-8 w-28 ml-auto text-right ${linha.situacao === "sem custo" ? "text-muted-foreground placeholder:text-muted-foreground/60" : ""}`}
        />
      </TableCell>
      <TableCell className="text-right">{brl(linha.liquido_unitario)}</TableCell>
      <TableCell className="text-right">{linha.lucro_unitario == null ? "—" : brl(linha.lucro_unitario)}</TableCell>
      <TableCell className={`text-right ${margemClass}`}>
        {linha.margem_pct == null ? "—" : `${linha.margem_pct.toFixed(1)}%`}
      </TableCell>
      <TableCell className="text-right">{brl(linha.preco_minimo)}</TableCell>
    </TableRow>
  );
}

function CalculadoraAvulsa() {
  const [custo, setCusto] = useState<string>("");
  const [margemDesejada, setMargemDesejada] = useState<string>("15");
  const custoNum = Number(custo.replace(",", "."));
  const margemNum = Number(margemDesejada.replace(",", "."));
  const valido = !Number.isNaN(custoNum) && custoNum > 0 && !Number.isNaN(margemNum);
  // preco = (custo + lucro + 4,00) / 0,80  onde lucro = preco * (margem/100)
  // => preco * 0.80 - preco * (m/100) = custo + 4
  // => preco = (custo + 4) / (0.80 - m/100)
  const denom = 0.8 - margemNum / 100;
  const preco = valido && denom > 0 ? (custoNum + 4) / denom : null;
  const lucro = preco != null ? preco * (margemNum / 100) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Calculadora de preço</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">Fórmula: preço = (custo + lucro + R$ 4,00) / 0,80 — taxa Shopee 20% + R$ 4 por pedido</p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Custo unitário (R$)</Label>
            <Input type="number" step="0.01" min="0" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Margem desejada (%)</Label>
            <Input type="number" step="0.1" min="0" max="80" value={margemDesejada} onChange={(e) => setMargemDesejada(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lucro por venda</Label>
            <div className="h-9 flex items-center px-3 rounded-md border bg-muted/30 text-sm">
              {lucro == null ? "—" : brl(lucro)}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preço de venda sugerido</Label>
            <div className="h-9 flex items-center px-3 rounded-md border bg-primary/10 text-sm font-semibold text-primary">
              {preco == null ? "—" : brl(preco)}
            </div>
          </div>
        </div>
        {valido && denom <= 0 && (
          <p className="mt-2 text-xs text-destructive">Margem desejada precisa ser menor que 80% (taxa Shopee).</p>
        )}
      </CardContent>
    </Card>
  );
}