import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { usePeriodo, computeRange } from "@/lib/periodo-store";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import { Snowflake, ArrowRight, Sparkles, CalendarIcon, TrendingUp, AlertTriangle } from "lucide-react";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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

type Preset = "hoje" | "ontem" | "7d" | "30d" | "mes" | "ano" | "custom";

function DashboardPage() {
  const { preset, custom, setPreset, setCustom } = usePeriodo();
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
    queryKey: ["shopee-connection-status", "principal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopee_connection_status" as any)
        .select("shop_id, shop_name, status")
        .eq("app_tipo", "principal")
        .maybeSingle();
      if (error) throw error;
      return data as { shop_id: number | null; shop_name: string | null; status: string } | null;
    },
  });
  const notConnected = !loadConn && (!conn || !conn.shop_id);

  const { data: kpis, isLoading: loadKpis, error: erroKpis } = useQuery({
    queryKey: ["kpis", p_de, p_ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_kpis_periodo" as any, { p_de, p_ate });
      if (error) throw error;
      const r = ((data as any)?.[0] ?? {}) as any;
      return {
        pedidosValidos: Number(r.pedidos_validos ?? 0),
        unidades: Number(r.unidades ?? 0),
        faturamento: Number(r.faturamento ?? 0),
        ticketMedio: Number(r.ticket_medio ?? 0),
        cancelados: Number(r.pedidos_cancelados ?? 0),
        valorCancelado: Number(r.valor_cancelado ?? 0),
        devolvidos: Number(r.pedidos_devolvidos ?? 0),
        valorDevolvido: Number(r.valor_devolvido ?? 0),
        taxas: Number(r.taxas ?? 0),
        taxasPct: Number(r.taxas_pct ?? 0),
        custoTotal: Number(r.custo_total ?? 0),
        custoPct: Number(r.custo_pct ?? 0),
        coberturaCusto: Number(r.cobertura_custo ?? 0),
        imposto: Number(r.imposto ?? 0),
        impostoPct: Number(r.imposto_pct ?? 0),
        valorLiquido: Number(r.valor_liquido ?? 0),
        lucroSemAds: Number(r.lucro_sem_ads ?? 0),
        lucroSemAdsPct: Number(r.lucro_sem_ads_pct ?? 0),
        lucroComAds: Number(r.lucro_com_ads ?? 0),
        lucroComAdsPct: Number(r.lucro_com_ads_pct ?? 0),
        lucroMedio: Number(r.lucro_medio ?? 0),
      };
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: 2,
  });

  const { data: serie, isLoading: loadSerie } = useQuery({
    queryKey: ["serie", p_de, p_ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_serie_periodo" as any, { p_de, p_ate });
      if (error) throw error;
      return ((data as any[]) ?? []).map((r) => ({
        periodo: String(r.periodo),
        rotulo: String(r.rotulo),
        pedidos: Number(r.pedidos ?? 0),
        faturamento: Number(r.faturamento ?? 0),
        parcial: Boolean(r.parcial),
      }));
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: 2,
  });

  const { data: topProdutos, isLoading: loadTop } = useQuery({
    queryKey: ["topProdutos", p_de, p_ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_top_produtos_periodo" as any, { p_de, p_ate, p_limite: 10 });
      if (error) throw error;
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
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: 2,
  });

  const { data: recentes, isLoading: loadRec } = useQuery({
    queryKey: ["recentes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("order_sn, status, valor_total, comprador_username, data_criacao_pedido")
        .order("data_criacao_pedido", { ascending: false, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  const { data: serieHora, isLoading: loadHora } = useQuery({
    queryKey: ["serie-horaria", p_de, p_ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_serie_horaria" as any, { p_de, p_ate });
      if (error) throw error;
      return ((data as any[]) ?? []).map((r) => ({
        rotulo: String(r.rotulo),
        pedidos: Number(r.pedidos ?? 0),
        faturamento: Number(r.faturamento ?? 0),
        ads: Number(r.ads_investimento ?? 0),
      }));
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: 2,
  });

  const semDadosHora = (serieHora ?? []).every((h) => h.pedidos === 0 && h.faturamento === 0);

  const { data: ads, isLoading: loadAds } = useQuery({
    queryKey: ["ads-resumo", p_de, p_ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ads_resumo" as any, { p_de, p_ate });
      if (error) throw error;
      const r = ((data as any)?.[0] ?? {}) as any;
      return {
        investimento: Number(r.investimento ?? 0),
        receita: Number(r.receita ?? 0),
        pedidos: Number(r.pedidos ?? 0),
        roas: Number(r.roas ?? 0),
        acos: Number(r.acos ?? 0),
        tacos: Number(r.tacos ?? 0),
      };
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: 2,
  });

  const { data: cancelados, isLoading: loadCanc } = useQuery({
    queryKey: ["cancelados", p_de, p_ate],
    queryFn: async () => {
      const desde = new Date(p_de + "T00:00:00-03:00").toISOString();
      const ate2 = new Date(p_ate + "T23:59:59-03:00").toISOString();
      const { data, error } = await supabase
        .from("pedidos")
        .select("order_sn, valor_total, comprador_username, data_criacao_pedido")
        .eq("status", "CANCELLED")
        .gte("data_criacao_pedido", desde)
        .lte("data_criacao_pedido", ate2)
        .order("data_criacao_pedido", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  const { data: abc, isLoading: loadAbc } = useQuery({
    queryKey: ["abc", p_de, p_ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("dashboard_curva_abc" as any, { p_de, p_ate, p_limite: 50 });
      if (error) throw error;
      return ((data as any[]) ?? []).map((r) => ({
        produto: String(r.produto ?? r.sku ?? ""),
        sku: String(r.sku ?? ""),
        unidades: Number(r.unidades ?? 0),
        receita: Number(r.receita ?? 0),
        participacao: Number(r.participacao ?? 0),
        acumulado: Number(r.acumulado ?? 0),
        classe: String(r.classe ?? ""),
      }));
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: 2,
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
              <SelectItem value="mes">Mês atual</SelectItem>
              <SelectItem value="ano">1 ano</SelectItem>
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

      {erroKpis && (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span>
              Não foi possível carregar os indicadores deste período:{" "}
              {(erroKpis as any)?.message ?? "erro desconhecido"}. Os valores exibidos podem estar desatualizados.
            </span>
          </CardContent>
        </Card>
      )}

      {/* BLOCO 1: Faixa de destaque */}
      <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-background">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" aria-hidden />
        <CardContent className="relative flex flex-col gap-4 p-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Faturamento</span>
            <div className="text-4xl md:text-5xl font-semibold tabular-nums leading-none">
              {loadKpis ? <Skeleton className="h-12 w-64" /> : brl(kpis?.faturamento ?? 0)}
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {loadKpis ? <Skeleton className="h-6 w-40" /> : (kpis?.coberturaCusto ?? 0) === 0 ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Lucro</span>
                  <span className="font-semibold text-lg">—</span>
                  <Link to="/produtos" search={{ q: "" }} className="text-xs text-primary underline underline-offset-2">
                    informe os custos em Produtos
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-muted-foreground">Lucro (sem Ads)</span>
                      <span className={`text-2xl font-semibold tabular-nums ${((kpis?.lucroSemAds ?? 0) >= 0) ? "text-[color:var(--warning)]" : "text-destructive"}`}>
                        {brl(kpis?.lucroSemAds ?? 0)}
                      </span>
                      <span className={`text-sm tabular-nums ${((kpis?.lucroSemAdsPct ?? 0) >= 0) ? "text-[color:var(--warning)]" : "text-destructive"}`}>
                        ({(kpis?.lucroSemAdsPct ?? 0).toFixed(1).replace(".", ",")}%)
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs text-muted-foreground">Lucro (com Ads)</span>
                      <span className={`text-lg font-semibold tabular-nums ${((kpis?.lucroComAds ?? 0) >= 0) ? "text-[color:var(--success)]" : "text-destructive"}`}>
                        {brl(kpis?.lucroComAds ?? 0)}
                      </span>
                      <span className={`text-xs tabular-nums ${((kpis?.lucroComAdsPct ?? 0) >= 0) ? "text-[color:var(--success)]" : "text-destructive"}`}>
                        ({(kpis?.lucroComAdsPct ?? 0).toFixed(1).replace(".", ",")}%)
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 text-right">
            {!loadKpis && (kpis?.coberturaCusto ?? 1) < 1 && (kpis?.coberturaCusto ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 px-2 py-0.5 text-[11px] text-[color:var(--warning)]">
                <AlertTriangle className="h-3 w-3" />
                custo informado em {((kpis?.coberturaCusto ?? 0) * 100).toFixed(0)}% das unidades
              </span>
            )}
            <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Período</span>
            <div className="text-sm tabular-nums">{rangeLabel}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 2: Cards de resultado */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
        <ResultCard
          label="Vendas"
          value={loadKpis ? null : String(kpis?.pedidosValidos ?? 0)}
          hint={loadKpis ? undefined : `${kpis?.unidades ?? 0} unidades`}
        />
        <ResultCard label="Ticket médio" value={loadKpis ? null : brl(kpis?.ticketMedio ?? 0)} />
        <ResultCard
          label="Lucro médio (sem Ads)"
          value={
            loadKpis
              ? null
              : (kpis?.coberturaCusto ?? 0) === 0 || (kpis?.pedidosValidos ?? 0) === 0
                ? "—"
                : brl((kpis?.lucroSemAds ?? 0) / (kpis?.pedidosValidos || 1))
          }
          hint={loadKpis ? undefined : "por pedido, antes de Ads"}
          tone="warning"
        />
        <ResultCard
          label="Lucro médio (com Ads)"
          value={loadKpis ? null : ((kpis?.coberturaCusto ?? 0) === 0 ? "—" : brl(kpis?.lucroMedio ?? 0))}
          hint={loadKpis ? undefined : "por pedido, já com Ads"}
          tone={((kpis?.lucroMedio ?? 0) < 0) ? "danger" : "success"}
        />
        <ResultCard
          label="Canceladas"
          value={loadKpis ? null : String(kpis?.cancelados ?? 0)}
          hint={loadKpis ? undefined : brl(kpis?.valorCancelado ?? 0)}
          tone="warning"
        />
        <ResultCard
          label="Devoluções"
          value={loadKpis ? null : String(kpis?.devolvidos ?? 0)}
          hint={loadKpis ? undefined : brl(kpis?.valorDevolvido ?? 0)}
          tone="warning"
        />
      </div>

      {/* BLOCO 3: Composição de custos */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <CompCard label="Custos" valor={loadKpis ? null : brl(kpis?.custoTotal ?? 0)} pct={loadKpis ? null : `${(kpis?.custoPct ?? 0).toFixed(1).replace(".", ",")}% do faturamento`} tone="danger" />
        <CompCard label="Tarifas" valor={loadKpis ? null : brl(kpis?.taxas ?? 0)} pct={loadKpis ? null : `${(kpis?.taxasPct ?? 0).toFixed(1).replace(".", ",")}% do faturamento`} tone="warning" />
        <CompCard label="Impostos" valor={loadKpis ? null : brl(kpis?.imposto ?? 0)} pct={loadKpis ? null : ((kpis?.impostoPct ?? 0) === 0 ? "defina em Configurações" : `${(kpis?.impostoPct ?? 0).toFixed(1).replace(".", ",")}% do faturamento`)} tone="muted" />
        <CompCard label="Líquido Shopee" valor={loadKpis ? null : brl(kpis?.valorLiquido ?? 0)} pct={null} tone="primary" />
      </div>

      {/* BLOCO 4: Ads */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Ads
          </CardTitle>
          <p className="text-xs text-muted-foreground">{rangeLabel}</p>
        </CardHeader>
        <CardContent>
          {!loadAds && (ads?.investimento ?? 0) === 0 && (ads?.receita ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados de Ads no período selecionado.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              {[
                { r: "Investimento", v: brl(ads?.investimento ?? 0) },
                { r: "Receita", v: brl(ads?.receita ?? 0) },
                { r: "ROAS", v: (ads?.roas ?? 0).toFixed(2).replace(".", ",") },
                { r: "ACOS", v: `${(ads?.acos ?? 0).toFixed(1).replace(".", ",")}%` },
                { r: "TACOS", v: `${(ads?.tacos ?? 0).toFixed(1).replace(".", ",")}%` },
              ].map((item) => (
                <div key={item.r} className="rounded-md border p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.r}</div>
                  {loadAds ? (
                    <Skeleton className="mt-1 h-6 w-24" />
                  ) : (
                    <div className="mt-1 text-lg font-semibold">{item.v}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Tabs defaultValue="fat">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Detalhamento</CardTitle>
                <TabsList>
                  <TabsTrigger value="fat">Faturamento</TabsTrigger>
                  <TabsTrigger value="abc">Curva ABC</TabsTrigger>
                  <TabsTrigger value="canc">Cancelados</TabsTrigger>
                </TabsList>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{rangeLabel}</p>
              <TabsContent value="fat" className="mt-4">
                <div className="h-72">
                  {loadSerie ? (
                    <Skeleton className="h-full w-full" />
                  ) : (serie ?? []).length === 0 ? (
                    <EmptyMini msg="Sem dados no período." />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={serie ?? []} margin={{ top: 12, right: 16, left: 4, bottom: 5 }}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" opacity={0.4} />
                        <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickFormatter={(v) => brlAbrev(Number(v))} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0].payload as any;
                          const d = new Date(p.periodo);
                          return (
                            <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                              <div className="font-medium">{format(d, "PPP", { locale: ptBR })}</div>
                              <div className="mt-1">Faturamento: <span className="tabular-nums font-medium">{brl(p.faturamento)}</span></div>
                              <div>Pedidos: <span className="tabular-nums font-medium">{p.pedidos}</span></div>
                              {p.parcial && <div className="mt-1 text-[10px] uppercase text-[color:var(--warning)]">parcial</div>}
                            </div>
                          );
                        }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar yAxisId="left" dataKey="faturamento" name="Faturamento" fill="var(--color-chart-1)" radius={[4,4,0,0]}>
                          {(serie ?? []).map((entry, i) => (
                            <Cell key={i} fillOpacity={entry.parcial ? 0.4 : 1} />
                          ))}
                        </Bar>
                        <Line yAxisId="right" type="monotone" dataKey="pedidos" name="Pedidos" stroke="var(--color-chart-2)" strokeWidth={1.5} dot={{ r: 2.5, fill: "var(--color-chart-2)" }} activeDot={{ r: 4 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="abc" className="mt-4">
                <CurvaAbcTable data={abc ?? []} loading={loadAbc} />
              </TabsContent>
              <TabsContent value="canc" className="mt-4">
                <CanceladosList data={cancelados ?? []} loading={loadCanc} />
              </TabsContent>
            </Tabs>
          </CardHeader>
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
          <CardTitle className="text-base">Vendas por faixa de hora</CardTitle>
          <p className="text-xs text-muted-foreground">
            {rangeLabel} · horário de Brasília · Ads medido pela variação do gasto entre as sincronizações (rateado por hora só se ainda não houver histórico)
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            {loadHora ? (
              <Skeleton className="h-full w-full" />
            ) : (serieHora ?? []).length === 0 || semDadosHora ? (
              <EmptyMini msg="Sem vendas no período." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serieHora ?? []} margin={{ top: 12, right: 16, left: 4, bottom: 5 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" opacity={0.4} />
                  <XAxis dataKey="rotulo" interval={1} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickFormatter={(v) => brlAbrev(Number(v))} />
                  <YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as any;
                    return (
                      <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                        <div className="font-medium">{String(label)}</div>
                        <div className="mt-1">Vendido: <span className="tabular-nums font-medium">{brl(p.faturamento)}</span></div>
                        <div>Pedidos: <span className="tabular-nums font-medium">{p.pedidos}</span></div>
                        <div>Ads: <span className="tabular-nums font-medium">{brl(p.ads)}</span></div>
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="left" type="monotone" dataKey="faturamento" name="Vendido" stroke="var(--color-chart-1)" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                  <Line yAxisId="right" type="monotone" dataKey="pedidos" name="Pedidos" stroke="var(--color-chart-2)" strokeWidth={1.5} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                  <Line yAxisId="left" type="monotone" dataKey="ads" name="Ads" stroke="var(--color-chart-3)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

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

function ResultCard({ label, value, hint, tone }: {
  label: string; value: string | null; hint?: string;
  tone?: "warning" | "success" | "danger";
}) {
  const valColor =
    tone === "danger" ? "text-destructive" :
    tone === "success" ? "text-[color:var(--success)]" :
    tone === "warning" ? "text-[color:var(--warning)]" : "";
  return (
    <Card>
      <CardContent className="p-5 space-y-1.5">
        <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        <div className={`text-2xl font-semibold tabular-nums leading-tight ${valColor}`}>
          {value === null ? <Skeleton className="h-7 w-24" /> : value}
        </div>
        {hint && <div className="text-[11px] text-muted-foreground tabular-nums">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function CompCard({ label, valor, pct: pctText, tone }: {
  label: string; valor: string | null; pct: string | null;
  tone: "danger" | "warning" | "muted" | "primary";
}) {
  const pctColor =
    tone === "danger" ? "text-destructive" :
    tone === "warning" ? "text-[color:var(--warning)]" :
    tone === "primary" ? "text-primary" : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-5 space-y-1.5">
        <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        <div className="text-2xl font-semibold tabular-nums leading-tight">
          {valor === null ? <Skeleton className="h-7 w-24" /> : valor}
        </div>
        {pctText !== null && <div className={`text-[11px] tabular-nums ${pctColor}`}>{pctText}</div>}
      </CardContent>
    </Card>
  );
}

function CurvaAbcTable({ data, loading }: { data: Array<{ produto: string; sku: string; unidades: number; receita: number; participacao: number; acumulado: number; classe: string }>; loading: boolean }) {
  if (loading) return <Skeleton className="h-72 w-full" />;
  if (!data.length) return <div className="h-72"><EmptyMini msg="Sem vendas no período." /></div>;
  const classA = data.filter((r) => r.classe === "A");
  const somaA = classA.reduce((s, r) => s + r.participacao, 0);
  const classeColor = (c: string) =>
    c === "A" ? "bg-[color:var(--success)]/15 text-[color:var(--success)] border-[color:var(--success)]/30" :
    c === "B" ? "bg-[color:var(--warning)]/15 text-[color:var(--warning)] border-[color:var(--warning)]/30" :
    "bg-muted text-muted-foreground border-border";
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{classA.length} produtos classe A</span> representam {somaA.toFixed(1).replace(".", ",")}% da receita
      </p>
      <div className="max-h-96 overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Produto</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-right">Un.</th>
              <th className="px-3 py-2 text-right">Receita</th>
              <th className="px-3 py-2 text-right">Part.</th>
              <th className="px-3 py-2 text-right">Acum.</th>
              <th className="px-3 py-2 text-center">Classe</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={r.sku + i} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 max-w-[240px] truncate" title={r.produto}>{r.produto}</td>
                <td className="px-3 py-2 text-muted-foreground">{r.sku}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.unidades}</td>
                <td className="px-3 py-2 text-right tabular-nums">{brl(r.receita)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.participacao.toFixed(1).replace(".", ",")}%</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.acumulado.toFixed(1).replace(".", ",")}%</td>
                <td className="px-3 py-2 text-center">
                  <span className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] font-semibold ${classeColor(r.classe)}`}>{r.classe}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CanceladosList({ data, loading }: { data: Array<{ order_sn: string; valor_total: number | null; comprador_username: string | null; data_criacao_pedido: string | null }>; loading: boolean }) {
  if (loading) return <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!data.length) return <div className="h-40"><EmptyMini msg="Nenhum cancelamento no período." /></div>;
  return (
    <div className="max-h-96 overflow-auto divide-y divide-border">
      {data.map((p) => (
        <div key={p.order_sn} className="flex items-center justify-between py-2.5 text-sm">
          <div className="min-w-0">
            <div className="font-medium truncate">#{p.order_sn}</div>
            <div className="text-xs text-muted-foreground truncate">
              {p.comprador_username ?? "—"} · {p.data_criacao_pedido ? new Date(p.data_criacao_pedido).toLocaleString("pt-BR") : "—"}
            </div>
          </div>
          <span className="tabular-nums font-medium text-destructive">{brl(Number(p.valor_total ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyMini({ msg }: { msg: string }) {
  return (
    <div className="flex h-full min-h-32 items-center justify-center text-sm text-muted-foreground">
      {msg}
    </div>
  );
}