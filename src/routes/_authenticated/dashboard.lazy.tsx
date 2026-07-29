import { createLazyFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  ComposedChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import { ShoppingBag, DollarSign, Receipt, Package, Wallet, XCircle as XCircleIcon, Snowflake, ArrowRight, Sparkles, CalendarIcon, Percent, PackageX } from "lucide-react";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

export const Route = createLazyFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const brlAbrev = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}k`;
  return `R$ ${v.toFixed(0)}`;
};
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
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

function DashboardPage() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState<DateRange | undefined>();
  const [customOpen, setCustomOpen] = useState(false);
  const { de, ate } = useMemo(() => computeRange(preset, custom), [preset, custom]);
  const p_de = toISO(de);
  const p_ate = toISO(ate);
  const diasDiff = Math.round((ate.getTime() - de.getTime()) / 86_400_000);
  const granLabel = diasDiff > 90 ? "mês" : diasDiff > 31 ? "semana" : "dia";

  const { data: syncRecent } = useQuery({
    queryKey: ["sync-log-recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_log" as any)
        .select("id, campo, de, ate, encontrados, gravados, duracao_ms, ok, erros, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      return ((data ?? []) as unknown) as Array<{
        id: string; campo: string | null; de: string | null; ate: string | null;
        encontrados: number | null; gravados: number | null; duracao_ms: number | null;
        ok: boolean; erros: any; created_at: string;
      }>;
    },
    refetchInterval: 60_000,
  });
  const ultimoOk = syncRecent?.find((s) => s.ok);
  const minutosDesde = ultimoOk ? Math.floor((Date.now() - new Date(ultimoOk.created_at).getTime()) / 60000) : null;
  let syncTone: "ok" | "warn" | "err" = "ok";
  let syncLabel = "Sem sincronizações";
  if (minutosDesde !== null) {
    if (minutosDesde >= 120) { syncTone = "err"; syncLabel = "Sincronização parada, verifique o cron"; }
    else if (minutosDesde >= 30) { syncTone = "warn"; syncLabel = `Atualizado há ${minutosDesde} min`; }
    else { syncTone = "ok"; syncLabel = `Atualizado há ${minutosDesde} min`; }
  }
  const toneClass =
    syncTone === "err" ? "text-destructive border-destructive/40 bg-destructive/10"
    : syncTone === "warn" ? "text-[color:var(--warning)] border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10"
    : "text-muted-foreground border-border bg-muted/30";
  const ToneIcon = syncTone === "err" ? XCircle : syncTone === "warn" ? AlertCircle : CheckCircle2;

  const { data: conn, isLoading: loadConn } = useQuery({
    queryKey: ["shopee-connection"],
    queryFn: async () => {
      const { data } = await supabase
        .from("shopee_connection_status" as any)
        .select("shop_id, shop_name, status")
        .eq("id", 1)
        .maybeSingle();
      return data as { shop_id: number | null; shop_name: string | null; status: string } | null;
    },
  });
  const notConnected = !loadConn && (!conn || !conn.shop_id);

  const { data: kpis, isLoading: loadKpis } = useQuery({
    queryKey: ["kpis", p_de, p_ate],
    queryFn: async () => {
      const { data } = await supabase.rpc("dashboard_kpis_periodo" as any, { p_de, p_ate });
      const r = ((data as any)?.[0] ?? {}) as any;
      return {
        faturamento: Number(r.faturamento_total ?? 0),
        pedidosValidos: Number(r.pedidos_validos ?? 0),
        pedidosTotal: Number(r.pedidos_total ?? 0),
        ticketMedio: Number(r.ticket_medio ?? 0),
        itens: Number(r.itens_vendidos ?? 0),
        cancelados: Number(r.pedidos_cancelados ?? 0),
        valorLiquido: Number(r.valor_liquido ?? 0),
        totalTaxas: Number(r.total_taxas ?? 0),
        cobertura: Number(r.cobertura_liquido ?? 0),
        faturamentoComEscrow: Number(r.faturamento_com_escrow ?? 0),
        percentualTaxas: Number(r.percentual_taxas ?? 0),
        margemLiquida: Number(r.margem_liquida ?? 0),
        projecaoLiquido: Number(r.projecao_liquido ?? 0),
      };
    },
  });

  const { data: serie, isLoading: loadSerie } = useQuery({
    queryKey: ["serie", p_de, p_ate],
    queryFn: async () => {
      const { data } = await supabase.rpc("dashboard_serie_periodo" as any, { p_de, p_ate });
      return ((data as any[]) ?? []).map((r) => ({
        periodo: String(r.periodo),
        rotulo: String(r.rotulo),
        pedidos: Number(r.pedidos ?? 0),
        faturamento: Number(r.faturamento ?? 0),
        parcial: Boolean(r.parcial),
      }));
    },
  });

  const { data: topProdutos, isLoading: loadTop } = useQuery({
    queryKey: ["topProdutos", p_de, p_ate],
    queryFn: async () => {
      const { data } = await supabase.rpc("dashboard_top_produtos_periodo" as any, { p_de, p_ate, p_limite: 10 });
      return ((data as any[]) ?? []).map((r) => ({
        nomeCompleto: String(r.produto ?? r.sku ?? ""),
        nome: String(r.produto ?? r.sku ?? "").length > 40
          ? String(r.produto ?? r.sku ?? "").slice(0, 40) + "…"
          : String(r.produto ?? r.sku ?? ""),
        sku: String(r.sku ?? ""),
        qtd: Number(r.quantidade ?? 0),
        receita: Number(r.receita ?? 0),
      }));
    },
  });

  const { data: recentes, isLoading: loadRec } = useQuery({
    queryKey: ["recentes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pedidos")
        .select("order_sn, status, valor_total, comprador_username, data_criacao_pedido")
        .order("data_criacao_pedido", { ascending: false, nullsFirst: false })
        .limit(10);
      return data ?? [];
    },
  });

  const rangeLabel = de.getTime() === ate.getTime()
    ? fmtBR(de)
    : `${fmtBR(de)} a ${fmtBR(ate)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral da sua loja Shopee</p>
        </div>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition hover:opacity-80 ${toneClass}`}
                title="Ver histórico de sincronizações"
              >
                <ToneIcon className="h-3.5 w-3.5" />
                {syncLabel}
              </button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Últimas sincronizações</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-2">
                {(syncRecent ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma execução registrada.</p>
                ) : (
                  (syncRecent ?? []).map((s) => (
                    <div key={s.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium tabular-nums">
                          {new Date(s.created_at).toLocaleString("pt-BR")}
                        </span>
                        <Badge variant={s.ok ? "secondary" : "destructive"}>
                          {s.ok ? "ok" : "erro"}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {s.campo ?? "—"} · encontrados {s.encontrados ?? 0} · gravados {s.gravados ?? 0}
                        {s.duracao_ms != null && <> · {s.duracao_ms} ms</>}
                      </div>
                      {s.erros && Array.isArray(s.erros) && s.erros.length > 0 && (
                        <ul className="mt-2 list-disc pl-4 text-xs text-destructive space-y-0.5">
                          {s.erros.slice(0, 5).map((e: any, i: number) => (
                            <li key={i} className="break-words">{String(e)}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))
                )}
              </div>
            </SheetContent>
          </Sheet>
          <span className="hidden text-xs text-muted-foreground md:inline tabular-nums">
            {rangeLabel}
          </span>
          <Select
            value={preset}
            onValueChange={(v) => {
              const p = v as Preset;
              setPreset(p);
              if (p === "custom") setCustomOpen(true);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="ontem">Ontem</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          <Popover open={customOpen} onOpenChange={setCustomOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={preset === "custom" ? "" : "hidden"}
              >
                <CalendarIcon className="h-4 w-4 mr-1.5" />
                {custom?.from ? rangeLabel : "Escolher datas"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={custom}
                onSelect={setCustom}
                locale={ptBR}
                className="p-3 pointer-events-auto"
              />
              <div className="flex justify-end gap-2 border-t p-2">
                <Button size="sm" variant="ghost" onClick={() => setCustom(undefined)}>
                  Limpar
                </Button>
                <Button
                  size="sm"
                  onClick={() => setCustomOpen(false)}
                  disabled={!custom?.from || !custom?.to}
                >
                  Aplicar
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {notConnected && (
        <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" aria-hidden />
          <CardContent className="relative flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Snowflake className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> Bem-vindo ao Dream Ice
                </div>
                <h2 className="text-lg font-semibold">Conecte sua loja Shopee para começar</h2>
                <p className="text-sm text-muted-foreground max-w-xl">
                  Assim que você autorizar o acesso, seus pedidos, produtos e faturamento aparecem
                  automaticamente aqui — sincronizados de hora em hora.
                </p>
              </div>
            </div>
            <Button asChild size="lg" className="w-full md:w-auto">
              <Link to="/configuracoes" search={{}}>
                Conectar Shopee <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <KpiCard icon={DollarSign} label="Faturamento" value={loadKpis ? null : brl(kpis?.faturamento ?? 0)} />
        <KpiCard
          icon={ShoppingBag}
          label="Pedidos"
          value={loadKpis ? null : String(kpis?.pedidosValidos ?? 0)}
          hint={loadKpis ? undefined : `de ${kpis?.pedidosTotal ?? 0} no total`}
        />
        <KpiCard icon={Receipt} label="Ticket médio" value={loadKpis ? null : brl(kpis?.ticketMedio ?? 0)} />
        <KpiCard icon={Package} label="Itens vendidos" value={loadKpis ? null : String(kpis?.itens ?? 0)} />
        {(() => {
          const cobertura = kpis?.cobertura ?? 0;
          const estimando = cobertura > 0 && cobertura < 0.95;
          const semDados = cobertura === 0;
          const tooltip = "Valor estimado a partir dos pedidos que já tiveram o repasse consultado.";

          const valorLiquidoValue = loadKpis
            ? null
            : semDados
              ? "—"
              : estimando
                ? brl(kpis?.projecaoLiquido ?? 0)
                : brl(kpis?.valorLiquido ?? 0);

          const valorLiquidoHint = loadKpis
            ? undefined
            : semDados
              ? "Aguardando sincronização de repasses"
              : estimando
                ? `margem de ${pct(kpis?.margemLiquida ?? 0)} medida em ${pct(cobertura)} dos pedidos`
                : `margem de ${pct(kpis?.margemLiquida ?? 0)}`;

          const taxasValue = loadKpis
            ? null
            : semDados
              ? "—"
              : brl(kpis?.totalTaxas ?? 0);

          const taxasHint = loadKpis
            ? undefined
            : semDados
              ? "Aguardando sincronização de repasses"
              : `${pct(kpis?.percentualTaxas ?? 0)} do faturamento medido`;

          return (
            <>
              <KpiCard
                icon={Wallet}
                label="Valor líquido"
                value={valorLiquidoValue}
                hint={valorLiquidoHint}
                estimativa={!loadKpis && estimando}
                tooltip={tooltip}
              />
              <KpiCard
                icon={Percent}
                label="Taxas Shopee"
                value={taxasValue}
                hint={taxasHint}
                tone="warning"
                tooltip={tooltip}
              />
            </>
          );
        })()}
        <KpiCard icon={XCircleIcon} label="Cancelados" value={loadKpis ? null : String(kpis?.cancelados ?? 0)} tone="warning" />
        <EstoqueBaixoKpi />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Faturamento e pedidos por {granLabel}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{rangeLabel}</p>
          </CardHeader>
          <CardContent className="h-72">
            {loadSerie ? (
              <Skeleton className="h-full w-full" />
            ) : (serie ?? []).length === 0 ? (
              <EmptyMini msg="Sem dados no período." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serie ?? []} margin={{ top: 12, right: 16, left: 4, bottom: 5 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" opacity={0.4} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                    tickFormatter={(v) => brlAbrev(Number(v))}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    stroke="var(--border)"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as any;
                      const d = new Date(p.periodo);
                      const dataStr = format(d, "PPP", { locale: ptBR });
                      return (
                        <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                          <div className="font-medium">{dataStr}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "var(--color-chart-1)" }} />
                            Faturamento: <span className="tabular-nums">{brl(p.faturamento)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--color-chart-2)" }} />
                            Pedidos: <span className="tabular-nums">{p.pedidos}</span>
                          </div>
                          {p.parcial && (
                            <div className="mt-1 text-[10px] uppercase tracking-wide text-[color:var(--warning)]">
                              dia em andamento
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    yAxisId="left"
                    dataKey="faturamento"
                    name="Faturamento"
                    fill="var(--color-chart-1)"
                    radius={[4, 4, 0, 0]}
                  >
                    {(serie ?? []).map((entry, i) => (
                      <Cell key={i} fillOpacity={entry.parcial ? 0.4 : 1} />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="pedidos"
                    name="Pedidos"
                    stroke="var(--color-chart-2)"
                    strokeWidth={1.5}
                    dot={{ r: 2.5, fill: "var(--color-chart-2)" }}
                    activeDot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 produtos vendidos</CardTitle>
            <p className="text-xs text-muted-foreground">{rangeLabel}</p>
          </CardHeader>
          <CardContent>
            {loadTop ? (
              <Skeleton className="h-72 w-full" />
            ) : (topProdutos ?? []).length === 0 ? (
              <div className="h-72"><EmptyMini msg="Sem vendas no período." /></div>
            ) : (
              <ul className="divide-y divide-border">
                {(topProdutos ?? []).map((p, i) => {
                  const max = Math.max(...(topProdutos ?? []).map((x) => x.qtd));
                  const pctBar = max > 0 ? (p.qtd / max) * 100 : 0;
                  return (
                    <li key={p.sku + i} className="py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium" title={p.nomeCompleto}>
                            {p.nome}
                          </div>
                          <div className="text-xs text-muted-foreground">{p.sku}</div>
                        </div>
                        <div className="shrink-0 text-right text-sm">
                          <div className="font-semibold tabular-nums">{p.qtd}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">{brl(p.receita)}</div>
                        </div>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pctBar}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pedidos recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loadRec ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (recentes ?? []).length === 0 ? (
            <EmptyMini msg="Nenhum pedido ainda. Conecte a loja em Configurações." />
          ) : (
            <div className="divide-y divide-border">
              {(recentes ?? []).map((p) => (
                <div key={p.order_sn} className="flex items-center justify-between py-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">#{p.order_sn}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {p.comprador_username ?? "—"} ·{" "}
                      {p.data_criacao_pedido
                        ? new Date(p.data_criacao_pedido).toLocaleString("pt-BR")
                        : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="secondary">{p.status ?? "—"}</Badge>
                    <span className="tabular-nums font-medium">{brl(Number(p.valor_total ?? 0))}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  estimativa,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  hint?: string;
  tone?: "warning";
  estimativa?: boolean;
  tooltip?: string;
}) {
  const toneRing =
    tone === "warning"
      ? "bg-[color:var(--warning)]/12 text-[color:var(--warning)] ring-1 ring-inset ring-[color:var(--warning)]/25"
      : "bg-primary/12 text-primary ring-1 ring-inset ring-primary/25";
  return (
    <Card className="relative overflow-hidden transition-colors hover:border-primary/40">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {label}
            </span>
            {estimativa && (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-500 ring-1 ring-inset ring-amber-500/30">
                estimativa
              </span>
            )}
            <div className="text-2xl font-semibold tabular-nums leading-tight">
              {value === null ? <Skeleton className="h-7 w-24" /> : value}
            </div>
            {hint && <div className="text-[11px] text-muted-foreground leading-tight">{hint}</div>}
          </div>
          {tooltip ? (
            <TooltipProvider delayDuration={100}>
              <UiTooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Mais informações"
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneRing} cursor-help`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[240px] text-xs leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{tooltip}</span>
                  </div>
                </TooltipContent>
              </UiTooltip>
            </TooltipProvider>
          ) : (
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneRing}`}>
              <Icon className="h-4 w-4" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyMini({ msg }: { msg: string }) {
  return (
    <div className="flex h-full min-h-32 items-center justify-center text-sm text-muted-foreground">
      {msg}
    </div>
  );
}

function EstoqueBaixoKpi() {
  const { data, isLoading } = useQuery({
    queryKey: ["estoque-baixo"],
    queryFn: async () => {
      const { data } = await supabase.rpc("produtos_com_giro" as any, { p_dias: 30 });
      const linhas = (data as any[]) ?? [];
      const emRisco = linhas.filter(
        (l) => l.dias_de_estoque != null && Number(l.dias_de_estoque) < 7,
      ).length;
      return emRisco;
    },
    staleTime: 60_000,
  });
  return (
    <KpiCard
      icon={PackageX}
      label="Estoque baixo"
      value={isLoading ? null : String(data ?? 0)}
      hint="menos de 7 dias"
      tone="warning"
    />
  );
}