import { createLazyFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { usePeriodo, computeRange } from "@/lib/periodo-store";
import { useLojaFiltro } from "@/lib/lojas-filtro-store";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  ImageOff,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Check,
  CalendarIcon,
  History,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { HistoricoCustoSheet } from "@/components/historico-custo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createLazyFileRoute("/_authenticated/produtos")({
  component: ProdutosPage,
});

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const toISO = (d: Date) => format(d, "yyyy-MM-dd");
const fmtBR = (d: Date) => format(d, "dd/MM/yyyy");

type Linha = {
  item_id: number;
  model_id: number;
  sku: string | null;
  produto: string | null;
  variacao: string | null;
  preco_atual: number | null;
  estoque_disponivel: number | null;
  vendidos_periodo: number;
  media_diaria: number;
  dias_de_estoque: number | null;
  status_item: string | null;
  imagem_url: string | null;
  custo_unitario: number | null;
  margem_pct: number | null;
};

type SortKey =
  | "grupo"
  | "grupo_vendidos"
  | "produto"
  | "variacao"
  | "sku"
  | "preco"
  | "estoque"
  | "vendidos"
  | "media"
  | "dias"
  | "custo"
  | "margem";
type SortDir = "asc" | "desc";

function ProdutosPage() {
  const qc = useQueryClient();
  const search = (useSearch({ strict: false }) as { q?: string }) ?? {};
  const navigate = useNavigate();
  const [busca, setBusca] = useState(search.q ?? "");
  useEffect(() => {
    if (search.q) setBusca(search.q);
  }, [search.q]);
  const [somenteRisco, setSomenteRisco] = useState(false);
  const [somenteVendidos, setSomenteVendidos] = useState(false);
  const [somenteNaoPrecificados, setSomenteNaoPrecificados] = useState(false);
  const { preset, custom, setPreset, setCustom } = usePeriodo();
  const { lojaId } = useLojaFiltro();
  const [customOpen, setCustomOpen] = useState(false);
  const { de, ate } = useMemo(() => computeRange(preset, custom), [preset, custom]);
  const p_de = toISO(de);
  const p_ate = toISO(ate);
  const rangeLabel = de.getTime() === ate.getTime() ? fmtBR(de) : `${fmtBR(de)} a ${fmtBR(ate)}`;
  const [sortKey, setSortKey] = useState<SortKey>("grupo");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data, isLoading } = useQuery({
    queryKey: ["produtos-giro", p_de, p_ate, lojaId],
    queryFn: async () => {
      const [{ data: giro, error: e1 }, { data: dim, error: e2 }, { data: lojaPrincipal }] =
        await Promise.all([
          supabase.rpc("produtos_com_giro" as any, { p_de, p_ate, p_loja_id: lojaId }),
          supabase
            .from("produto_custos" as any)
            .select("item_id, model_id, custo_unitario")
            .is("vigencia_fim", null),
          supabase
            .from("lojas" as any)
            .select("id")
            .eq("status", "ativa")
            .order("id")
            .limit(1)
            .maybeSingle(),
        ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const custoMap = new Map<string, number | null>();
      for (const d of (dim ?? []) as any[]) {
        custoMap.set(
          `${d.item_id}:${d.model_id}`,
          d.custo_unitario == null ? null : Number(d.custo_unitario),
        );
      }

      // Custo por SKU cadastrado na loja principal, usado quando a loja
      // do item não tem custo próprio — mesmo produto físico, SKU igual.
      const skuCustoPrincipal = new Map<string, number>();
      const idLojaPrincipal = (lojaPrincipal as any)?.id;
      if (idLojaPrincipal != null) {
        const { data: produtosPrincipal } = await supabase
          .from("produtos" as any)
          .select("item_id, model_id, sku")
          .eq("loja_id", idLojaPrincipal);
        for (const p of (produtosPrincipal ?? []) as any[]) {
          if (!p.sku) continue;
          const custo = custoMap.get(`${p.item_id}:${p.model_id}`);
          if (custo != null) skuCustoPrincipal.set(p.sku, custo);
        }
      }

      return ((giro as any[]) ?? []).map((r) => {
        const item_id = Number(r.item_id ?? 0);
        const model_id = Number(r.model_id ?? 0);
        const custo_unitario =
          custoMap.get(`${item_id}:${model_id}`) ??
          (r.sku ? (skuCustoPrincipal.get(r.sku) ?? null) : null);
        const preco = r.preco_atual == null ? null : Number(r.preco_atual);
        let margem_pct: number | null = null;
        if (custo_unitario != null && preco != null && preco > 0) {
          margem_pct = Math.round((1000 * (preco * 0.8 - 4 - custo_unitario)) / preco) / 10;
        }
        return {
          item_id: Number(r.item_id ?? 0),
          model_id: Number(r.model_id ?? 0),
          sku: r.sku ?? null,
          produto: r.produto ?? null,
          variacao: r.variacao ?? null,
          preco_atual: preco,
          estoque_disponivel: r.estoque_disponivel == null ? null : Number(r.estoque_disponivel),
          vendidos_periodo: Number(r.vendidos_periodo ?? 0),
          media_diaria: Number(r.media_diaria ?? 0),
          dias_de_estoque: r.dias_de_estoque == null ? null : Number(r.dias_de_estoque),
          status_item: r.status_item ?? null,
          imagem_url: r.imagem_url ?? null,
          custo_unitario,
          margem_pct,
        };
      }) as Linha[];
    },
  });

  const linhas = useMemo(() => {
    let base = data ?? [];
    if (busca.trim()) {
      const b = busca.trim().toLowerCase();
      base = base.filter(
        (l) =>
          (l.produto ?? "").toLowerCase().includes(b) || (l.sku ?? "").toLowerCase().includes(b),
      );
    }
    if (somenteRisco) {
      base = base.filter((l) => l.dias_de_estoque != null && l.dias_de_estoque < 15);
    }
    if (somenteVendidos) {
      base = base.filter((l) => (l.vendidos_periodo ?? 0) > 0);
    }
    if (somenteNaoPrecificados) {
      base = base.filter((l) => l.custo_unitario == null);
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const cmpStr = (a: string | null, b: string | null) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return a.localeCompare(b, "pt-BR");
    };
    const cmpNum = (a: number | null, b: number | null) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return a - b;
    };
    const sorted = [...base];
    if (sortKey === "grupo") {
      sorted.sort((a, b) => cmpStr(a.produto, b.produto) || cmpStr(a.variacao, b.variacao));
    } else if (sortKey === "grupo_vendidos") {
      const totalPorAnuncio = new Map<string, number>();
      for (const l of base) {
        const k = String(l.item_id ?? l.produto ?? "");
        totalPorAnuncio.set(k, (totalPorAnuncio.get(k) ?? 0) + (l.vendidos_periodo ?? 0));
      }
      const tot = (l: Linha) => totalPorAnuncio.get(String(l.item_id ?? l.produto ?? "")) ?? 0;
      sorted.sort(
        (a, b) =>
          tot(b) - tot(a) ||
          cmpStr(a.produto, b.produto) ||
          (b.vendidos_periodo ?? 0) - (a.vendidos_periodo ?? 0) ||
          cmpStr(a.variacao, b.variacao),
      );
    } else if (sortKey === "produto") {
      sorted.sort((a, b) => dir * cmpStr(a.produto, b.produto) || cmpStr(a.variacao, b.variacao));
    } else if (sortKey === "variacao") {
      sorted.sort((a, b) => dir * cmpStr(a.variacao, b.variacao) || cmpStr(a.produto, b.produto));
    } else if (sortKey === "sku") {
      sorted.sort((a, b) => dir * cmpStr(a.sku, b.sku));
    } else if (sortKey === "preco") {
      sorted.sort((a, b) => dir * cmpNum(a.preco_atual, b.preco_atual));
    } else if (sortKey === "estoque") {
      sorted.sort((a, b) => dir * cmpNum(a.estoque_disponivel, b.estoque_disponivel));
    } else if (sortKey === "vendidos") {
      sorted.sort((a, b) => dir * cmpNum(a.vendidos_periodo, b.vendidos_periodo));
    } else if (sortKey === "media") {
      sorted.sort((a, b) => dir * cmpNum(a.media_diaria, b.media_diaria));
    } else if (sortKey === "dias") {
      sorted.sort((a, b) => dir * cmpNum(a.dias_de_estoque, b.dias_de_estoque));
    } else if (sortKey === "custo") {
      sorted.sort((a, b) => dir * cmpNum(a.custo_unitario, b.custo_unitario));
    } else if (sortKey === "margem") {
      sorted.sort((a, b) => dir * cmpNum(a.margem_pct, b.margem_pct));
    }
    return sorted;
  }, [data, busca, somenteRisco, somenteVendidos, somenteNaoPrecificados, sortKey, sortDir]);

  const totaisRodape = useMemo(() => {
    const total = data?.length ?? 0;
    const comCusto = (data ?? []).filter((l) => l.custo_unitario != null).length;
    return { total, comCusto };
  }, [data]);

  const agrupar = sortKey === "grupo" || sortKey === "grupo_vendidos";

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortHead = ({
    label,
    col,
    align = "left",
    className,
  }: {
    label: string;
    col: SortKey;
    align?: "left" | "right";
    className?: string;
  }) => {
    const active = sortKey === col;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => handleSort(col)}
          className={cn(
            "inline-flex items-center gap-1 select-none hover:text-foreground transition-colors",
            align === "right" && "w-full justify-end",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span>{label}</span>
          <Icon className={cn("h-3.5 w-3.5", !active && "opacity-40")} />
        </button>
      </TableHead>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo, estoque e giro · {rangeLabel}. Sincroniza de hora em hora.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={preset}
            onValueChange={(v) => {
              setPreset(v as any);
              if (v === "custom") setCustomOpen(true);
            }}
          >
            <SelectTrigger className="w-[180px]">
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
          {preset === "custom" && (
            <Popover open={customOpen} onOpenChange={setCustomOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {custom?.from ? rangeLabel : "Escolher datas"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0 bg-popover">
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  selected={custom}
                  onSelect={(r: DateRange | undefined) => setCustom(r)}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      <Tabs defaultValue="catalogo" className="space-y-4">
        <TabsList>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          <TabsTrigger value="ads">Ads</TabsTrigger>
        </TabsList>
        <TabsContent value="catalogo" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-52">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou SKU…"
                    value={busca}
                    onChange={(e) => {
                      setBusca(e.target.value);
                      navigate({
                        to: "/produtos",
                        search: e.target.value ? ({ q: e.target.value } as any) : ({} as any),
                        replace: true,
                      });
                    }}
                    className="pl-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="risco" checked={somenteRisco} onCheckedChange={setSomenteRisco} />
                  <Label htmlFor="risco" className="cursor-pointer">
                    Risco de ruptura (&lt; 15 dias)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="vendidos"
                    checked={somenteVendidos}
                    onCheckedChange={setSomenteVendidos}
                  />
                  <Label htmlFor="vendidos" className="cursor-pointer">
                    Somente vendidos no período
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="nao-precificados"
                    checked={somenteNaoPrecificados}
                    onCheckedChange={setSomenteNaoPrecificados}
                  />
                  <Label htmlFor="nao-precificados" className="cursor-pointer">
                    Não precificados
                  </Label>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Button
                  type="button"
                  size="sm"
                  variant={sortKey === "grupo" ? "default" : "outline"}
                  onClick={() => {
                    setSortKey("grupo");
                    setSortDir("asc");
                  }}
                >
                  Por anúncio
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={sortKey === "grupo_vendidos" ? "default" : "outline"}
                  onClick={() => {
                    setSortKey("grupo_vendidos");
                    setSortDir("desc");
                  }}
                >
                  Por anúncio · mais vendidos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={sortKey === "vendidos" && sortDir === "desc" ? "default" : "outline"}
                  onClick={() => {
                    setSortKey("vendidos");
                    setSortDir("desc");
                  }}
                >
                  Mais vendidos
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={sortKey === "dias" && sortDir === "asc" ? "default" : "outline"}
                  onClick={() => {
                    setSortKey("dias");
                    setSortDir("asc");
                  }}
                >
                  Risco de ruptura
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <TooltipProvider delayDuration={200}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[60px]"></TableHead>
                        <SortHead label="Produto" col="produto" className="min-w-[360px]" />
                        <SortHead label="Variação" col="variacao" />
                        <SortHead label="SKU" col="sku" />
                        <SortHead label="Preço" col="preco" align="right" className="text-right" />
                        <SortHead
                          label="Estoque"
                          col="estoque"
                          align="right"
                          className="text-right"
                        />
                        <SortHead
                          label="Vendidos"
                          col="vendidos"
                          align="right"
                          className="text-right"
                        />
                        <SortHead
                          label="Média/dia"
                          col="media"
                          align="right"
                          className="text-right"
                        />
                        <SortHead
                          label="Dias de estoque"
                          col="dias"
                          align="right"
                          className="text-right"
                        />
                        <SortHead label="Custo" col="custo" align="right" className="text-right" />
                        <SortHead
                          label="Margem"
                          col="margem"
                          align="right"
                          className="text-right"
                        />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        [...Array(8)].map((_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={11}>
                              <Skeleton className="h-10 w-full" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : linhas.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={11}
                            className="text-center py-10 text-sm text-muted-foreground"
                          >
                            Nenhum produto. Sincronize a loja em Configurações.
                          </TableCell>
                        </TableRow>
                      ) : (
                        linhas.map((p, idx) => {
                          const diasEstoque = p.dias_de_estoque;
                          let rowClass = "";
                          let diasClass = "tabular-nums";
                          if (diasEstoque != null) {
                            if (diasEstoque < 7) {
                              rowClass = "bg-destructive/10 hover:bg-destructive/15";
                              diasClass = "tabular-nums font-semibold text-destructive";
                            } else if (diasEstoque < 15) {
                              rowClass = "bg-amber-500/10 hover:bg-amber-500/15";
                              diasClass = "tabular-nums font-semibold text-amber-500";
                            }
                          }
                          const prev = idx > 0 ? linhas[idx - 1] : null;
                          const primeiroDoGrupo =
                            !agrupar || !prev || (prev.produto ?? "") !== (p.produto ?? "");
                          const mostrarNome = !agrupar || primeiroDoGrupo;
                          const bordaGrupo =
                            agrupar && primeiroDoGrupo && idx > 0
                              ? "border-t-2 border-border/70"
                              : "";
                          return (
                            <TableRow
                              key={`${p.sku ?? idx}-${idx}`}
                              className={cn(rowClass, bordaGrupo)}
                            >
                              <TableCell>
                                {p.imagem_url ? (
                                  <img
                                    src={p.imagem_url}
                                    alt=""
                                    loading="lazy"
                                    className="h-10 w-10 rounded object-cover"
                                  />
                                ) : (
                                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-muted-foreground">
                                    <ImageOff className="h-4 w-4" />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="font-medium max-w-[420px]">
                                {mostrarNome ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="block truncate cursor-default">
                                        {p.produto ?? "—"}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-md">
                                      {p.produto ?? "—"}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span className="text-muted-foreground/40">↳</span>
                                )}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {p.variacao ?? "—"}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {p.sku ?? "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {brl(p.preco_atual)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {p.estoque_disponivel ?? "—"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {p.vendidos_periodo.toLocaleString("pt-BR")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {p.media_diaria.toFixed(2)}
                              </TableCell>
                              <TableCell className={`text-right ${diasClass}`}>
                                {diasEstoque == null ? "—" : diasEstoque.toFixed(1)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums p-1">
                                <CustoCell
                                  item_id={p.item_id}
                                  model_id={p.model_id}
                                  initial={p.custo_unitario}
                                  titulo={[p.produto, p.variacao].filter(Boolean).join(" — ")}
                                  onSaved={() =>
                                    qc.invalidateQueries({ queryKey: ["produtos-giro"] })
                                  }
                                />
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {p.margem_pct == null ? "—" : `${p.margem_pct.toFixed(1)}%`}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TooltipProvider>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                <span>{totaisRodape.total} variações no total</span>
                <span>
                  {totaisRodape.comCusto} com custo preenchido
                  {totaisRodape.total > 0 && (
                    <span className="ml-1">
                      ({Math.round((totaisRodape.comCusto / totaisRodape.total) * 100)}%)
                    </span>
                  )}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ads">
          <AdsPorProduto p_de={p_de} p_ate={p_ate} rangeLabel={rangeLabel} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type LinhaAds = {
  item_id: number;
  produto: string | null;
  investimento: number;
  receita_ads: number;
  cliques: number;
  impressoes: number;
  ctr: number;
  roas: number;
};

type AdsSortKey =
  "produto" | "investimento" | "receita_ads" | "cliques" | "impressoes" | "ctr" | "roas";

function AdsPorProduto({
  p_de,
  p_ate,
  rangeLabel,
}: {
  p_de: string;
  p_ate: string;
  rangeLabel: string;
}) {
  const [somenteAtivos, setSomenteAtivos] = useState(false);
  const [sortKey, setSortKey] = useState<AdsSortKey>("investimento");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { lojaId } = useLojaFiltro();

  const { data, isLoading, error } = useQuery({
    queryKey: ["produtos-com-ads", p_de, p_ate, lojaId],
    queryFn: async (): Promise<LinhaAds[]> => {
      const { data, error } = await supabase.rpc("produtos_com_ads" as any, {
        p_de,
        p_ate,
        p_loja_id: lojaId,
      });
      if (error) throw error;
      return ((data as any[]) ?? []).map((r) => ({
        item_id: Number(r.item_id ?? 0),
        produto: r.produto ?? null,
        investimento: Number(r.investimento ?? 0),
        receita_ads: Number(r.receita_ads ?? 0),
        cliques: Number(r.cliques ?? 0),
        impressoes: Number(r.impressoes ?? 0),
        ctr: Number(r.ctr ?? 0),
        roas: Number(r.roas ?? 0),
      }));
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

  const { data: imagens } = useQuery({
    queryKey: ["produtos-imagens-ads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos" as any)
        .select("item_id, imagem_url")
        .not("imagem_url", "is", null);
      if (error) throw error;
      const m = new Map<number, string>();
      for (const r of (data as any[]) ?? []) {
        const id = Number(r.item_id);
        if (id && r.imagem_url && !m.has(id)) m.set(id, String(r.imagem_url));
      }
      return m;
    },
    staleTime: 5 * 60_000,
  });

  const { data: ativos } = useQuery({
    queryKey: ["ads-itens-ativos"],
    queryFn: async () => {
      const desde = new Date();
      desde.setDate(desde.getDate() - 1);
      const { data, error } = await supabase
        .from("ads_campanhas" as any)
        .select("item_id")
        .eq("status", "ongoing")
        .gte("data", toISO(desde));
      if (error) throw error;
      const s = new Set<number>();
      for (const r of (data as any[]) ?? []) {
        if (r.item_id) s.add(Number(r.item_id));
      }
      return s;
    },
    staleTime: 60_000,
  });

  const todas = data ?? [];
  const filtradas = somenteAtivos && ativos ? todas.filter((l) => ativos.has(l.item_id)) : todas;

  const linhas = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const cmpStr = (a: string | null, b: string | null) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return a.localeCompare(b, "pt-BR");
    };
    const cmpNum = (a: number, b: number) => a - b;
    const sorted = [...filtradas];
    switch (sortKey) {
      case "produto":
        sorted.sort((a, b) => dir * cmpStr(a.produto, b.produto));
        break;
      case "investimento":
        sorted.sort((a, b) => dir * cmpNum(a.investimento, b.investimento));
        break;
      case "receita_ads":
        sorted.sort((a, b) => dir * cmpNum(a.receita_ads, b.receita_ads));
        break;
      case "cliques":
        sorted.sort((a, b) => dir * cmpNum(a.cliques, b.cliques));
        break;
      case "impressoes":
        sorted.sort((a, b) => dir * cmpNum(a.impressoes, b.impressoes));
        break;
      case "ctr":
        sorted.sort((a, b) => dir * cmpNum(a.ctr, b.ctr));
        break;
      case "roas":
        sorted.sort((a, b) => dir * cmpNum(a.roas, b.roas));
        break;
    }
    return sorted;
  }, [filtradas, sortKey, sortDir]);

  const visiveisIds = useMemo(() => linhas.map((l) => l.item_id), [linhas]);
  const allSelected = visiveisIds.length > 0 && visiveisIds.every((id) => selected.has(id));
  const someSelected = visiveisIds.some((id) => selected.has(id)) && !allSelected;

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of visiveisIds) next.delete(id);
      } else {
        for (const id of visiveisIds) next.add(id);
      }
      return next;
    });
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (key: AdsSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortHeadAds = ({
    label,
    col,
    align = "left",
    className,
  }: {
    label: string;
    col: AdsSortKey;
    align?: "left" | "right";
    className?: string;
  }) => {
    const active = sortKey === col;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => handleSort(col)}
          className={cn(
            "inline-flex items-center gap-1 select-none hover:text-foreground transition-colors",
            align === "right" && "w-full justify-end",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span>{label}</span>
          <Icon className={cn("h-3.5 w-3.5", !active && "opacity-40")} />
        </button>
      </TableHead>
    );
  };

  const selecionadas = useMemo(
    () => linhas.filter((l) => selected.has(l.item_id)),
    [linhas, selected],
  );

  const kpi = useMemo(() => {
    const base = selecionadas.length > 0 ? selecionadas : linhas;
    const investimento = base.reduce((s, l) => s + l.investimento, 0);
    const receita = base.reduce((s, l) => s + l.receita_ads, 0);
    const cliques = base.reduce((s, l) => s + l.cliques, 0);
    const impressoes = base.reduce((s, l) => s + l.impressoes, 0);
    const roas = investimento > 0 ? receita / investimento : 0;
    const ctr = impressoes > 0 ? (cliques / impressoes) * 100 : 0;
    const cpc = cliques > 0 ? investimento / cliques : 0;
    return {
      itens: base.length,
      investimento,
      receita,
      cliques,
      impressoes,
      roas,
      ctr,
      cpc,
      selecionados: selecionadas.length,
    };
  }, [linhas, selecionadas]);

  const KpiCard = ({
    label,
    value,
    sub,
    tone = "default",
  }: {
    label: string;
    value: string;
    sub?: string;
    tone?: "default" | "success" | "warning" | "danger";
  }) => {
    const toneClass = {
      default: "",
      success: "border-l-4 border-l-success",
      warning: "border-l-4 border-l-warning",
      danger: "border-l-4 border-l-destructive",
    }[tone];
    return (
      <Card className={cn("overflow-hidden", toneClass)}>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-lg sm:text-xl font-bold mt-1 truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        <KpiCard
          label="Investimento"
          value={brl(kpi.investimento)}
          sub={kpi.selecionados > 0 ? `${kpi.selecionados} selecionados` : `${kpi.itens} itens`}
          tone={kpi.investimento > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Receita gerada"
          value={brl(kpi.receita)}
          sub={kpi.selecionados > 0 ? `${kpi.selecionados} selecionados` : `${kpi.itens} itens`}
          tone={kpi.receita > 0 ? "success" : "default"}
        />
        <KpiCard
          label="ROAS"
          value={kpi.roas.toFixed(2).replace(".", ",")}
          sub={kpi.roas >= 4 ? "Excelente" : kpi.roas >= 2 ? "Bom" : kpi.roas > 0 ? "Atenção" : "—"}
          tone={
            kpi.roas >= 4
              ? "success"
              : kpi.roas >= 2
                ? "default"
                : kpi.roas > 0
                  ? "warning"
                  : "default"
          }
        />
        <KpiCard
          label="CTR"
          value={`${kpi.ctr.toFixed(2).replace(".", ",")}%`}
          sub={kpi.ctr > 0 ? `${kpi.cliques.toLocaleString("pt-BR")} cliques` : "—"}
          tone={kpi.ctr >= 2 ? "success" : kpi.ctr > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Cliques"
          value={kpi.cliques.toLocaleString("pt-BR")}
          sub={kpi.cpc > 0 ? `CPC ${brl(kpi.cpc)}` : "—"}
        />
        <KpiCard
          label="Impressões"
          value={kpi.impressoes.toLocaleString("pt-BR")}
          sub={kpi.impressoes > 0 ? `alcance dos anúncios` : "—"}
        />
        <KpiCard
          label="Itens"
          value={String(kpi.itens)}
          sub={kpi.selecionados > 0 ? `${kpi.selecionados} selecionados` : `total no período`}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Desempenho de Ads por produto</h2>
              <p className="text-sm text-muted-foreground">
                {rangeLabel} · selecione os itens para filtrar os cards
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="ads-ativos" checked={somenteAtivos} onCheckedChange={setSomenteAtivos} />
              <Label htmlFor="ads-ativos" className="text-sm">
                Só com Ads ativos
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[52px] text-center">
                    <Checkbox
                      id="select-all-ads"
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Selecionar todos os itens visíveis"
                    />
                  </TableHead>
                  <TableHead className="w-[64px]"></TableHead>
                  <SortHeadAds label="Produto" col="produto" className="min-w-[300px]" />
                  <SortHeadAds
                    label="Investimento"
                    col="investimento"
                    align="right"
                    className="text-right"
                  />
                  <SortHeadAds
                    label="Receita gerada"
                    col="receita_ads"
                    align="right"
                    className="text-right"
                  />
                  <SortHeadAds label="Cliques" col="cliques" align="right" className="text-right" />
                  <SortHeadAds
                    label="Impressões"
                    col="impressoes"
                    align="right"
                    className="text-right"
                  />
                  <SortHeadAds label="CTR" col="ctr" align="right" className="text-right" />
                  <SortHeadAds label="ROAS" col="roas" align="right" className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={9}>
                        <Skeleton className="h-10 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-sm text-destructive">
                      Não foi possível carregar os dados de Ads.
                    </TableCell>
                  </TableRow>
                ) : linhas.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center py-10 text-sm text-muted-foreground"
                    >
                      {somenteAtivos
                        ? "Nenhum produto com Ads ativos no momento."
                        : "Sem dados de Ads por produto no período selecionado."}
                    </TableCell>
                  </TableRow>
                ) : (
                  linhas.map((l) => {
                    const rowClass =
                      l.roas > 5
                        ? "bg-[color:var(--success)]/10 hover:bg-[color:var(--success)]/15"
                        : l.roas < 2
                          ? "bg-destructive/10 hover:bg-destructive/15"
                          : undefined;
                    const roasClass =
                      l.roas > 5
                        ? "text-[color:var(--success)]"
                        : l.roas < 2
                          ? "text-destructive"
                          : "";
                    const checked = selected.has(l.item_id);
                    return (
                      <TableRow key={l.item_id} className={cn(rowClass, checked && "bg-primary/5")}>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleOne(l.item_id)}
                            aria-label={`Selecionar ${l.produto ?? `Item ${l.item_id}`}`}
                          />
                        </TableCell>
                        <TableCell>
                          {imagens?.get(l.item_id) ? (
                            <img
                              src={imagens.get(l.item_id)}
                              alt={l.produto ?? `Item ${l.item_id}`}
                              loading="lazy"
                              className="h-10 w-10 rounded-md object-cover border border-border"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                              <ImageOff className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium max-w-[420px]">
                          <span className="line-clamp-2">{l.produto ?? `Item ${l.item_id}`}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {brl(l.investimento)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {brl(l.receita_ads)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.cliques.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.impressoes.toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.ctr.toFixed(2).replace(".", ",")}%
                        </TableCell>
                        <TableCell
                          className={cn("text-right tabular-nums font-semibold", roasClass)}
                        >
                          {l.roas.toFixed(2).replace(".", ",")}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CustoCell({
  item_id,
  model_id,
  initial,
  titulo,
  onSaved,
}: {
  item_id: number;
  model_id: number;
  initial: number | null;
  titulo?: string | null;
  onSaved: () => void;
}) {
  const initStr = initial == null ? "" : String(initial).replace(".", ",");
  const [valor, setValor] = useState<string>(initStr);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  useEffect(() => {
    setValor(initStr);
  }, [initStr]);
  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOk(false), 2000);
    return () => clearTimeout(t);
  }, [ok]);

  const salvar = async () => {
    if (valor === initStr) return;
    if (valor.trim() === "") {
      setValor(initStr);
      return;
    }
    const parsed = Number(valor.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Custo inválido");
      setValor(initStr);
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("registrar_custo" as any, {
      p_item_id: item_id,
      p_model_id: model_id,
      p_custo: parsed,
      p_inicio: null,
      p_observacao: null,
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar custo", { description: error.message });
      return;
    }
    setOk(true);
    onSaved();
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {ok && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
      <Input
        type="text"
        inputMode="decimal"
        value={valor}
        disabled={saving}
        onChange={(e) => setValor(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setValor(initStr);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="—"
        className="h-8 w-24 text-right tabular-nums"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        title="Histórico de custo"
        aria-label="Histórico de custo"
        onClick={() => setHistOpen(true)}
      >
        <History className="h-4 w-4" />
      </Button>
      <HistoricoCustoSheet
        open={histOpen}
        onOpenChange={setHistOpen}
        item_id={item_id}
        model_id={model_id}
        titulo={titulo}
        onSaved={onSaved}
      />
    </div>
  );
}
