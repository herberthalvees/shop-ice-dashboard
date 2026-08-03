import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { CalendarIcon, Download, Search, ChevronLeft, ChevronRight, Info, ImageOff } from "lucide-react";
import { usePeriodo, computeRange } from "@/lib/periodo-store";
import { FiltroMarketplace } from "@/components/filtro-marketplace";
import { filtroMarketplace, useMarketplace } from "@/lib/marketplace-store";

export const Route = createLazyFileRoute("/_authenticated/pedidos")({
  component: PedidosPage,
});

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toISO = (d: Date) => format(d, "yyyy-MM-dd");
const fmtBR = (d: Date) => format(d, "dd/MM/yyyy");

const PAGE_SIZE = 50;
const NAO_CONCRETIZADO = ["UNPAID", "CANCELLED", "TO_RETURN"];

function corMargem(margem: number | null) {
  const m = margem == null ? -Infinity : Number(margem);
  if (m >= 0 && m <= 5) {
    return { texto: "text-destructive", badge: "border-destructive/40 bg-destructive/10 text-destructive" };
  }
  if (m > 5 && m <= 10) {
    return { texto: "text-amber-400", badge: "border-amber-400/40 bg-amber-400/10 text-amber-400" };
  }
  if (m > 10) {
    return { texto: "text-emerald-500", badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" };
  }
  return { texto: "text-muted-foreground", badge: "border-muted-foreground/40 bg-muted-foreground/10 text-muted-foreground" };
}

type Linha = {
  total_linhas: number;
  order_sn: string;
  data_pedido: string | null;
  status: string | null;
  produto: string | null;
  sku: string | null;
  imagem_url: string | null;
  quantidade: number | null;
  valor: number | null;
  tarifa: number | null;
  frete_vendedor: number | null;
  custo: number | null;
  imposto: number | null;
  lucro: number | null;
  margem_pct: number | null;
  comprador: string | null;
  tem_escrow: boolean | null;
};

function PedidosPage() {
  const { preset, custom, setPreset, setCustom } = usePeriodo();
  const { marketplace } = useMarketplace();
  const p_marketplace = filtroMarketplace(marketplace) ?? null;
  const mkKey = p_marketplace ?? "todos";
  const [customOpen, setCustomOpen] = useState(false);
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("todos");
  const [pagina, setPagina] = useState(0);

  const { de, ate } = useMemo(() => computeRange(preset, custom), [preset, custom]);
  const p_de = toISO(de);
  const p_ate = toISO(ate);
  const rangeLabel = de.getTime() === ate.getTime() ? fmtBR(de) : `${fmtBR(de)} a ${fmtBR(ate)}`;
  const p_busca = busca.trim() ? busca.trim() : null;
  const p_status = status === "todos" ? null : status;

  useEffect(() => { setPagina(0); }, [p_de, p_ate, busca, status, mkKey]);

  const { data: statusOpcoes } = useQuery({
    queryKey: ["status-disponiveis"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("status_disponiveis" as any);
      if (error) throw error;
      return ((data as unknown) as { status: string; pedidos: number }[]) ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["pedidos-detalhe", p_de, p_ate, p_busca, p_status, pagina, mkKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pedidos_detalhe" as any, {
        p_de, p_ate, p_offset: pagina * PAGE_SIZE, p_limite: PAGE_SIZE, p_busca, p_status, p_marketplace,
      });
      if (error) throw error;
      const linhas = ((data as unknown) as Linha[]) ?? [];
      return { linhas, total: Number(linhas[0]?.total_linhas ?? 0) };
    },
  });

  const { data: totais, isLoading: loadTotais } = useQuery({
    queryKey: ["pedidos-detalhe-totais", p_de, p_ate, p_busca, p_status, mkKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pedidos_detalhe_totais" as any, {
        p_de, p_ate, p_busca, p_status, p_marketplace,
      });
      if (error) throw error;
      const r = (Array.isArray(data) ? data[0] : data) as any;
      return {
        valor: Number(r?.valor ?? 0),
        tarifa: Number(r?.tarifa ?? 0),
        custo: Number(r?.custo ?? 0),
        lucro: Number(r?.lucro ?? 0),
        estimadas: Number(r?.linhas_estimadas ?? 0),
      };
    },
  });

  const linhas = data?.linhas ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const estimadas = totais?.estimadas ?? 0;
  const nota = estimadas > 0 ? `inclui ${estimadas} linha${estimadas === 1 ? "" : "s"} estimada${estimadas === 1 ? "" : "s"}` : undefined;

  async function exportarCSV() {
    const { data: full } = await supabase.rpc("pedidos_detalhe" as any, {
      p_de, p_ate, p_offset: 0, p_limite: 5000, p_busca, p_status, p_marketplace,
    });
    const rows = ((full as unknown) as Linha[]) ?? [];
    const header = ["pedido", "data", "status", "produto", "sku", "qtde", "valor", "tarifa", "frete", "custo", "imposto", "lucro", "margem_pct", "comprador"];
    const csv = [
      header.join(","),
      ...rows.map((r) => [
        r.order_sn, r.data_pedido ?? "", r.status ?? "", r.produto ?? "", r.sku ?? "",
        r.quantidade ?? 0, r.valor ?? 0, r.tarifa ?? 0, r.frete_vendedor ?? 0,
        r.custo ?? "", r.imposto ?? 0,
        NAO_CONCRETIZADO.includes(r.status ?? "") ? 0 : (r.lucro ?? ""),
        r.margem_pct ?? "", r.comprador ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pedidos_${p_de}_a_${p_ate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
            <p className="text-sm text-muted-foreground">
              Lucro por item vendido · {rangeLabel} · {total} linha{total === 1 ? "" : "s"}
            </p>
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
            <Button variant="outline" onClick={exportarCSV} disabled={!total}>
              <Download className="mr-2 h-4 w-4" /> CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <CardTotal titulo="Valor" valor={loadTotais ? null : brl(totais?.valor)} />
          <CardTotal titulo="Tarifas Shopee" valor={loadTotais ? null : brl(totais?.tarifa)} nota={nota} />
          <CardTotal titulo="Custo dos produtos" valor={loadTotais ? null : brl(totais?.custo)} />
          <CardTotal
            titulo="Lucro"
            valor={loadTotais ? null : brl(totais?.lucro)}
            tom={(totais?.lucro ?? 0) < 0 ? "neg" : "pos"}
            destaque
            nota={nota}
          />
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-3">
              <form
                className="relative flex-1 min-w-56"
                onSubmit={(e) => { e.preventDefault(); setBusca(buscaInput); }}
              >
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por pedido, SKU, produto ou comprador…"
                  value={buscaInput}
                  onChange={(e) => setBuscaInput(e.target.value)}
                  onBlur={() => setBusca(buscaInput)}
                  className="pl-9"
                />
              </form>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {(statusOpcoes ?? []).map((s) => (
                    <SelectItem key={s.status} value={s.status}>
                      {s.status} ({Number(s.pedidos).toLocaleString("pt-BR")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Foto</TableHead>
                    <TableHead className="min-w-56">Produto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Qtde</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-help">
                            Tarifa <Info className="h-3 w-3" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Comissão, taxa de serviço e taxa de transação do pedido. Quando o pedido
                          tem vários itens, a tarifa, o frete e o valor líquido são rateados entre
                          eles proporcionalmente à receita de cada item.
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-right">Frete</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Imposto</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    [...Array(6)].map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={11}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                    ))
                  ) : linhas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                        Nenhum item encontrado no período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    linhas.map((r, i) => {
                      const naoConcretizado = NAO_CONCRETIZADO.includes(r.status ?? "");
                      const semCusto = r.custo == null;
                      const lucro = naoConcretizado ? 0 : r.lucro;
                      const estimado = !naoConcretizado && r.tem_escrow === false;
                      return (
                        <TableRow key={`${r.order_sn}-${r.sku ?? i}-${i}`} className={naoConcretizado ? "opacity-50" : undefined}>
                          <TableCell>
                            {r.imagem_url ? (
                              <img
                                src={r.imagem_url}
                                alt={r.produto ?? "Produto"}
                                loading="lazy"
                                className="h-10 w-10 rounded-md object-cover border border-border"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted/40">
                                <ImageOff className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-72">
                            <div className="truncate font-medium">{r.produto ?? "—"}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              #{r.order_sn}{r.comprador ? ` · ${r.comprador}` : ""} · {r.status ?? "—"}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.sku ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {r.data_pedido ? format(new Date(r.data_pedido), "dd/MM/yy HH:mm") : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.quantidade ?? 0}</TableCell>
                          <TableCell className="text-right tabular-nums">{brl(r.valor)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{brl(r.tarifa)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{brl(r.frete_vendedor)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{semCusto ? "—" : brl(r.custo)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{brl(r.imposto)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                              <span
                                className={
                                  "font-semibold tabular-nums " +
                                  (naoConcretizado || semCusto
                                    ? "text-muted-foreground"
                                    : corMargem(Number(r.margem_pct)).texto)
                                }
                              >
                                {brl(lucro)}
                              </span>
                              {estimado ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help text-xs text-muted-foreground">*</span>
                                  </TooltipTrigger>
                                  <TooltipContent>estimado, repasse ainda não consultado</TooltipContent>
                                </Tooltip>
                              ) : null}
                              {naoConcretizado ? (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">não concretizado</Badge>
                              ) : semCusto ? (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">sem custo</Badge>
                              ) : r.margem_pct != null ? (
                                <Badge
                                  variant="outline"
                                  className={"text-[10px] " + corMargem(Number(r.margem_pct)).badge}
                                >
                                  {Number(r.margem_pct).toFixed(1)}%
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Página {pagina + 1} de {totalPaginas}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={pagina + 1 >= totalPaginas} onClick={() => setPagina(pagina + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function CardTotal({
  titulo, valor, tom, destaque, nota,
}: { titulo: string; valor: string | null; tom?: "pos" | "neg"; destaque?: boolean; nota?: string }) {
  return (
    <Card className={destaque ? "border-primary/40" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {valor == null ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <div className={"text-2xl font-semibold tabular-nums " + (tom === "neg" ? "text-destructive" : tom === "pos" ? "text-emerald-500" : "")}>
            {valor}
          </div>
        )}
        {valor != null && nota ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{nota}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
