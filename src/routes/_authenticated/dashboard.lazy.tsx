import { createLazyFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, subDays, startOfDay, endOfDay, startOfYesterday, endOfYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LabelList,
} from "recharts";
import { ShoppingBag, DollarSign, Calendar as CalendarIcon, CalendarDays, Truck, AlertTriangle, Snowflake, ArrowRight, Sparkles } from "lucide-react";
import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createLazyFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type PeriodoPreset = "hoje" | "ontem" | "7d" | "30d" | "custom";

function DashboardPage() {
  const [periodo, setPeriodo] = useState<PeriodoPreset>("30d");
  const [dataCustom, setDataCustom] = useState<Date | undefined>(new Date());

  const range = computeRange(periodo, dataCustom);
  const dias = range.dias;

  function computeRange(p: PeriodoPreset, custom?: Date) {
    const agora = new Date();
    switch (p) {
      case "hoje":
        return { desde: startOfDay(agora).toISOString(), ate: endOfDay(agora).toISOString(), dias: 1, label: "hoje" };
      case "ontem":
        return { desde: startOfYesterday().toISOString(), ate: endOfYesterday().toISOString(), dias: 1, label: "ontem" };
      case "7d":
        return { desde: startOfDay(subDays(agora, 6)).toISOString(), ate: endOfDay(agora).toISOString(), dias: 7, label: "7d" };
      case "30d":
        return { desde: startOfDay(subDays(agora, 29)).toISOString(), ate: endOfDay(agora).toISOString(), dias: 30, label: "30d" };
      case "custom":
      default: {
        const d = custom ?? agora;
        return { desde: startOfDay(d).toISOString(), ate: endOfDay(d).toISOString(), dias: 1, label: format(d, "dd/MM/yyyy") };
      }
    }
  }

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
    queryKey: ["kpis", periodo, dataCustom?.toISOString()],
    queryFn: async () => {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const [pedidosHoje, pedidosPeriodo, aguardando, estoqueBaixo, cfg] = await Promise.all([
        supabase.from("pedidos").select("valor_total", { count: "exact" }).gte("data_criacao_pedido", hoje.toISOString()),
        supabase.from("pedidos").select("valor_total").gte("data_criacao_pedido", range.desde).lte("data_criacao_pedido", range.ate),
        supabase.from("pedidos").select("id", { count: "exact", head: true }).ilike("status", "%READY_TO_SHIP%"),
        supabase.from("config").select("limite_estoque_baixo").eq("id", 1).maybeSingle(),
        supabase.from("produtos").select("id", { count: "exact", head: true }),
      ]);
      const limiteReal = aguardando ? (estoqueBaixo.data?.limite_estoque_baixo ?? 5) : 5;
      const { count: baixoCount } = await supabase
        .from("produtos")
        .select("id", { count: "exact", head: true })
        .lte("estoque", limiteReal);
      const fatHoje = (pedidosHoje.data ?? []).reduce((s, p) => s + Number(p.valor_total ?? 0), 0);
      const fatPeriodo = (pedidosPeriodo.data ?? []).reduce((s, p) => s + Number(p.valor_total ?? 0), 0);
      return {
        pedidosHoje: pedidosHoje.count ?? 0,
        fatHoje,
        fatPeriodo,
        pedidosPeriodo: pedidosPeriodo.data?.length ?? 0,
        aguardando: aguardando.count ?? 0,
        estoqueBaixo: baixoCount ?? 0,
        limite: limiteReal,
        totalProdutos: cfg.count ?? 0,
      };
    },
  });

  const periodoLabel =
    periodo === "hoje" ? "hoje"
    : periodo === "ontem" ? "ontem"
    : periodo === "7d" ? "7d"
    : periodo === "30d" ? "30d"
    : range.label;

  const { data: serie, isLoading: loadSerie } = useQuery({
    queryKey: ["serie", periodo, dataCustom?.toISOString()],
    queryFn: async () => {
      const { data } = await supabase
        .from("pedidos")
        .select("data_criacao_pedido, valor_total")
        .gte("data_criacao_pedido", range.desde)
        .lte("data_criacao_pedido", range.ate);
      const buckets = new Map<string, { pedidos: number; faturamento: number }>();
      const start = new Date(range.desde);
      const end = new Date(range.ate);
      const totalDias = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      for (let i = 0; i < totalDias; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        buckets.set(d.toISOString().slice(0, 10), { pedidos: 0, faturamento: 0 });
      }
      for (const p of data ?? []) {
        if (!p.data_criacao_pedido) continue;
        const k = new Date(p.data_criacao_pedido).toISOString().slice(0, 10);
        const b = buckets.get(k);
        if (b) {
          b.pedidos += 1;
          b.faturamento += Number(p.valor_total ?? 0);
        }
      }
      return Array.from(buckets.entries()).map(([data, v]) => ({
        data: totalDias === 1 ? data : data.slice(5),
        ...v,
      }));
    },
  });

  const { data: topProdutos, isLoading: loadTop } = useQuery({
    queryKey: ["topProdutos", periodo, dataCustom?.toISOString()],
    queryFn: async () => {
      const { data } = await supabase
        .from("pedidos")
        .select("itens")
        .gte("data_criacao_pedido", range.desde)
        .lte("data_criacao_pedido", range.ate);
      const map = new Map<string, number>();
      for (const p of data ?? []) {
        const itens = (p.itens as any[]) ?? [];
        for (const it of itens) {
          const nome = it.item_name ?? it.name ?? it.item_sku ?? `Item ${it.item_id ?? "?"}`;
          const qtd = Number(it.model_quantity_purchased ?? it.quantity ?? it.qtd ?? 1);
          map.set(nome, (map.get(nome) ?? 0) + qtd);
        }
      }
      return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([nome, qtd]) => ({ nome: nome.length > 30 ? nome.slice(0, 30) + "…" : nome, qtd }));
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
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoPreset)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="ontem">Ontem</SelectItem>
              <SelectItem value="7d">Últimos 7d</SelectItem>
              <SelectItem value="30d">Últimos 30d</SelectItem>
              <SelectItem value="custom">Data personalizada</SelectItem>
            </SelectContent>
          </Select>
          {periodo === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[180px] justify-start text-left font-normal",
                    !dataCustom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dataCustom ? format(dataCustom, "dd/MM/yyyy", { locale: ptBR }) : <span>Escolha a data</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dataCustom}
                  onSelect={setDataCustom}
                  initialFocus
                  className="p-3 pointer-events-auto"
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          )}
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

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={ShoppingBag} label="Pedidos hoje" value={loadKpis ? null : String(kpis?.pedidosHoje ?? 0)} />
        <KpiCard icon={DollarSign} label="Faturamento hoje" value={loadKpis ? null : brl(kpis?.fatHoje ?? 0)} />
        <KpiCard icon={CalendarDays} label={`Faturamento ${periodoLabel}`} value={loadKpis ? null : brl(kpis?.fatPeriodo ?? 0)} />
        <KpiCard icon={Truck} label="Aguardando envio" value={loadKpis ? null : String(kpis?.aguardando ?? 0)} />
        <KpiCard icon={AlertTriangle} label="Estoque baixo" value={loadKpis ? null : String(kpis?.estoqueBaixo ?? 0)} tone="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {periodo === "hoje" && "Pedidos e faturamento — hoje"}
              {periodo === "ontem" && "Pedidos e faturamento — ontem"}
              {periodo === "custom" && `Pedidos e faturamento — ${range.label}`}
              {(periodo === "7d" || periodo === "30d") && `Pedidos e faturamento — últimos ${dias}d`}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {loadSerie ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serie ?? []} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" opacity={0.4} />
                  <XAxis dataKey="data" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
                    labelStyle={{ color: "var(--muted-foreground)" }}
                    formatter={(v: any, name: string) => name === "Faturamento (R$)" ? [brl(Number(v)), name] : [v, name]}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="pedidos" name="Pedidos" stroke="var(--color-chart-1)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-chart-1)" }} activeDot={{ r: 5 }}>
                    <LabelList dataKey="pedidos" position="top" fontSize={11} fill="var(--color-chart-1)" />
                  </Line>
                  <Line yAxisId="right" type="monotone" dataKey="faturamento" name="Faturamento (R$)" stroke="var(--color-chart-2)" strokeWidth={2} dot={{ r: 3, fill: "var(--color-chart-2)" }} activeDot={{ r: 5 }}>
                    <LabelList dataKey="faturamento" position="bottom" fontSize={11} fill="var(--color-chart-2)" formatter={(v: any) => Number(v) > 0 ? brl(Number(v)) : ""} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 produtos vendidos</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {loadTop ? (
              <Skeleton className="h-full w-full" />
            ) : (topProdutos ?? []).length === 0 ? (
              <EmptyMini msg="Sem vendas no período." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProdutos ?? []} layout="vertical" margin={{ left: 20, right: 12 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" opacity={0.4} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                  <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                  <Tooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.3 }}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }}
                  />
                  <Bar dataKey="qtd" fill="var(--color-chart-1)" radius={[0, 6, 6, 0]}>
                    <LabelList dataKey="qtd" position="right" fontSize={11} fill="var(--foreground)" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  tone?: "warning";
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
            <div className="text-2xl font-semibold tabular-nums leading-tight">
              {value === null ? <Skeleton className="h-7 w-24" /> : value}
            </div>
          </div>
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneRing}`}>
            <Icon className="h-4 w-4" />
          </div>
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