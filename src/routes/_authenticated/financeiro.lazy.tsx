import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, Wallet, ArrowDownCircle, ArrowUpCircle, Clock, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { usePeriodo, computeRange } from "@/lib/periodo-store";

export const Route = createLazyFileRoute("/_authenticated/financeiro")({
  component: FinanceiroPage,
});

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toISO = (d: Date) => format(d, "yyyy-MM-dd");
const fmtBR = (d: Date) => format(d, "dd/MM/yyyy");
const fmtDataHora = (iso: string | null) => (iso ? format(new Date(iso), "dd/MM/yyyy HH:mm") : "—");

const PAGE_SIZE = 50;

type Transacao = {
  transaction_id: number;
  tipo: string | null;
  fluxo: string | null;
  valor: number | null;
  saldo_apos: number | null;
  order_sn: string | null;
  descricao: string | null;
  data_transacao: string | null;
};

function FinanceiroPage() {
  const { preset, custom, setPreset, setCustom } = usePeriodo();
  const [customOpen, setCustomOpen] = useState(false);
  const [tipoFiltro, setTipoFiltro] = useState<string>("todos");
  const [buscaOrder, setBuscaOrder] = useState("");
  const [buscaOrderInput, setBuscaOrderInput] = useState("");
  const [pagina, setPagina] = useState(0);

  const { de, ate } = useMemo(() => computeRange(preset, custom), [preset, custom]);
  const p_de = toISO(de);
  const p_ate = toISO(ate);
  const rangeLabel = de.getTime() === ate.getTime() ? fmtBR(de) : `${fmtBR(de)} a ${fmtBR(ate)}`;

  // Reseta paginação ao mudar filtros
  useMemo(() => { setPagina(0); }, [p_de, p_ate, tipoFiltro, buscaOrder]);

  const { data: resumo, isLoading: loadingResumo } = useQuery({
    queryKey: ["carteira-resumo", p_de, p_ate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("carteira_resumo" as any, { p_de, p_ate });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        saldo_atual: row?.saldo_atual == null ? null : Number(row.saldo_atual),
        saldo_em: row?.saldo_em ?? null,
        entradas: Number(row?.entradas ?? 0),
        saidas: Number(row?.saidas ?? 0),
        saques: Number(row?.saques ?? 0),
        em_transito: Number(row?.em_transito ?? 0),
        pedidos_em_transito: Number(row?.pedidos_em_transito ?? 0),
      };
    },
  });

  // Tipos disponíveis no período
  const { data: tipos } = useQuery({
    queryKey: ["carteira-tipos", p_de, p_ate],
    queryFn: async () => {
      const dataDe = `${p_de}T00:00:00-03:00`;
      const dataAte = `${p_ate}T23:59:59-03:00`;
      const { data, error } = await supabase
        .from("carteira_transacoes" as any)
        .select("tipo")
        .gte("data_transacao", dataDe)
        .lte("data_transacao", dataAte)
        .limit(500);
      if (error) throw error;
      const set = new Set<string>();
      for (const r of (data as any[]) ?? []) if (r.tipo) set.add(r.tipo);
      return Array.from(set).sort();
    },
  });

  const { data: pagResult, isLoading: loadingTabela } = useQuery({
    queryKey: ["carteira-tx", p_de, p_ate, tipoFiltro, buscaOrder, pagina],
    queryFn: async () => {
      const dataDe = `${p_de}T00:00:00-03:00`;
      const dataAte = `${p_ate}T23:59:59-03:00`;
      let q = supabase
        .from("carteira_transacoes" as any)
        .select("transaction_id, tipo, fluxo, valor, saldo_apos, order_sn, descricao, data_transacao", { count: "exact" })
        .gte("data_transacao", dataDe)
        .lte("data_transacao", dataAte)
        .order("data_transacao", { ascending: false })
        .range(pagina * PAGE_SIZE, pagina * PAGE_SIZE + PAGE_SIZE - 1);
      if (tipoFiltro !== "todos") q = q.eq("tipo", tipoFiltro);
      if (buscaOrder.trim()) q = q.ilike("order_sn", `%${buscaOrder.trim()}%`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { linhas: (data as unknown as Transacao[]) ?? [], total: count ?? 0 };
    },
  });

  const total = pagResult?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground">Movimentações da carteira Shopee · {rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={preset} onValueChange={(v) => { setPreset(v as any); if (v === "custom") setCustomOpen(true); }}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
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
          {preset === "custom" && (
            <Popover open={customOpen} onOpenChange={setCustomOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {custom?.from ? rangeLabel : "Escolher datas"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0 bg-popover">
                <Calendar mode="range" numberOfMonths={2} selected={custom} onSelect={(r: DateRange | undefined) => setCustom(r)} locale={ptBR} />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <CardResumo
          titulo="Saldo disponível"
          icone={<Wallet className="h-4 w-4" />}
          valor={loadingResumo ? null : brl(resumo?.saldo_atual)}
          subtitulo={resumo?.saldo_em ? `atualizado em ${fmtDataHora(resumo.saldo_em)}` : "sem transações registradas"}
          destaque
        />
        <CardResumo
          titulo="Entradas no período"
          icone={<ArrowDownCircle className="h-4 w-4 text-emerald-500" />}
          valor={loadingResumo ? null : brl(resumo?.entradas)}
          subtitulo="créditos recebidos"
        />
        <CardResumo
          titulo="Saques no período"
          icone={<ArrowUpCircle className="h-4 w-4 text-orange-500" />}
          valor={loadingResumo ? null : brl(resumo?.saques)}
          subtitulo="transferências para banco"
        />
        <CardResumo
          titulo="Em trânsito"
          icone={<Clock className="h-4 w-4 text-amber-500" />}
          valor={loadingResumo ? null : brl(resumo?.em_transito)}
          subtitulo={
            resumo
              ? `${resumo.pedidos_em_transito} pedido${resumo.pedidos_em_transito === 1 ? "" : "s"} aguardando liberação`
              : ""
          }
        />
      </div>

      {/* Filtros da tabela */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {(tipos ?? []).map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); setBuscaOrder(buscaOrderInput); }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="w-[240px] pl-8"
              placeholder="Buscar por order_sn"
              value={buscaOrderInput}
              onChange={(e) => setBuscaOrderInput(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">Buscar</Button>
          {buscaOrder && (
            <Button type="button" variant="ghost" onClick={() => { setBuscaOrder(""); setBuscaOrderInput(""); }}>
              Limpar
            </Button>
          )}
        </form>
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transações · {total.toLocaleString("pt-BR")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Saldo após</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingTabela ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (pagResult?.linhas.length ?? 0) === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                      Nenhuma transação encontrada no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagResult!.linhas.map((t) => {
                    const positivo = t.fluxo === "MONEY_IN";
                    const negativo = t.fluxo === "MONEY_OUT";
                    return (
                      <TableRow key={t.transaction_id}>
                        <TableCell className="whitespace-nowrap text-sm">{fmtDataHora(t.data_transacao)}</TableCell>
                        <TableCell><Badge variant="outline">{t.tipo ?? "—"}</Badge></TableCell>
                        <TableCell className="max-w-[420px] truncate text-sm" title={t.descricao ?? ""}>{t.descricao ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{t.order_sn ?? "—"}</TableCell>
                        <TableCell
                          className={
                            "text-right font-medium " +
                            (positivo ? "text-emerald-500" : negativo ? "text-rose-500" : "")
                          }
                        >
                          {t.valor == null ? "—" : (positivo ? "+ " : negativo ? "- " : "") + brl(Math.abs(Number(t.valor)))}
                        </TableCell>
                        <TableCell className="text-right text-sm">{brl(t.saldo_apos)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Página {pagina + 1} de {totalPaginas}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina + 1 >= totalPaginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CardResumo({
  titulo, icone, valor, subtitulo, destaque,
}: {
  titulo: string;
  icone: React.ReactNode;
  valor: string | null;
  subtitulo?: string;
  destaque?: boolean;
}) {
  return (
    <Card className={destaque ? "border-primary/40" : undefined}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{titulo}</CardTitle>
        {icone}
      </CardHeader>
      <CardContent>
        {valor == null ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <div className={"text-2xl font-semibold " + (destaque ? "text-primary" : "")}>{valor}</div>
        )}
        {subtitulo && <p className="mt-1 text-xs text-muted-foreground">{subtitulo}</p>}
      </CardContent>
    </Card>
  );
}