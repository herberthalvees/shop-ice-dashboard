import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ImageOff, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const Route = createLazyFileRoute("/_authenticated/produtos")({
  component: ProdutosPage,
});

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Linha = {
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
  const [busca, setBusca] = useState("");
  const [somenteRisco, setSomenteRisco] = useState(false);
  const [dias, setDias] = useState<number>(30);
  const [sortKey, setSortKey] = useState<SortKey>("grupo");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data, isLoading } = useQuery({
    queryKey: ["produtos-giro", dias, sortKey, sortDir],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("produtos_giro_ordenado" as any, {
        p_dias: dias,
        p_sort: sortKey,
        p_dir: sortDir,
      });
      if (error) throw error;
      return ((data as any[]) ?? []).map((r) => ({
        sku: r.sku ?? null,
        produto: r.produto ?? null,
        variacao: r.variacao ?? null,
        preco_atual: r.preco_atual == null ? null : Number(r.preco_atual),
        estoque_disponivel: r.estoque_disponivel == null ? null : Number(r.estoque_disponivel),
        vendidos_periodo: Number(r.vendidos_periodo ?? 0),
        media_diaria: Number(r.media_diaria ?? 0),
        dias_de_estoque: r.dias_de_estoque == null ? null : Number(r.dias_de_estoque),
        status_item: r.status_item ?? null,
        imagem_url: r.imagem_url ?? null,
        custo_unitario: r.custo_unitario == null ? null : Number(r.custo_unitario),
        margem_pct: r.margem_pct == null ? null : Number(r.margem_pct),
      })) as Linha[];
    },
  });

  const linhas = useMemo(() => {
    let base = data ?? [];
    if (busca.trim()) {
      const b = busca.trim().toLowerCase();
      base = base.filter(
        (l) =>
          (l.produto ?? "").toLowerCase().includes(b) ||
          (l.sku ?? "").toLowerCase().includes(b),
      );
    }
    if (somenteRisco) {
      base = base.filter((l) => l.dias_de_estoque != null && l.dias_de_estoque < 15);
    }
    return base;
  }, [data, busca, somenteRisco]);

  const agrupar = sortKey === "grupo";

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
            Catálogo, estoque e giro dos últimos {dias} dias. Sincroniza de hora em hora.
          </p>
        </div>
        <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="15">Últimos 15 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="60">Últimos 60 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou SKU…" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="risco" checked={somenteRisco} onCheckedChange={setSomenteRisco} />
              <Label htmlFor="risco" className="cursor-pointer">Risco de ruptura (&lt; 15 dias)</Label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              variant={sortKey === "grupo" ? "default" : "outline"}
              onClick={() => { setSortKey("grupo"); setSortDir("asc"); }}
            >
              Por anúncio
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sortKey === "vendidos" && sortDir === "desc" ? "default" : "outline"}
              onClick={() => { setSortKey("vendidos"); setSortDir("desc"); }}
            >
              Mais vendidos
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sortKey === "dias" && sortDir === "asc" ? "default" : "outline"}
              onClick={() => { setSortKey("dias"); setSortDir("asc"); }}
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
                  <SortHead label="Estoque" col="estoque" align="right" className="text-right" />
                  <SortHead label="Vendidos" col="vendidos" align="right" className="text-right" />
                  <SortHead label="Média/dia" col="media" align="right" className="text-right" />
                  <SortHead label="Dias de estoque" col="dias" align="right" className="text-right" />
                  <SortHead label="Custo" col="custo" align="right" className="text-right" />
                  <SortHead label="Margem" col="margem" align="right" className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(8)].map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={11}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                  ))
                ) : linhas.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-10 text-sm text-muted-foreground">
                    Nenhum produto. Sincronize a loja em Configurações.
                  </TableCell></TableRow>
                ) : (
                  linhas.map((p, idx) => {
                    const diasEstoque = p.dias_de_estoque;
                    let rowClass = "";
                    let diasClass = "tabular-nums";
                    if (diasEstoque != null) {
                      if (diasEstoque < 7) { rowClass = "bg-destructive/10 hover:bg-destructive/15"; diasClass = "tabular-nums font-semibold text-destructive"; }
                      else if (diasEstoque < 15) { rowClass = "bg-amber-500/10 hover:bg-amber-500/15"; diasClass = "tabular-nums font-semibold text-amber-500"; }
                    }
                    const prev = idx > 0 ? linhas[idx - 1] : null;
                    const primeiroDoGrupo = !agrupar || !prev || (prev.produto ?? "") !== (p.produto ?? "");
                    const mostrarNome = !agrupar || primeiroDoGrupo;
                    const bordaGrupo = agrupar && primeiroDoGrupo && idx > 0 ? "border-t-2 border-border/70" : "";
                    return (
                      <TableRow key={`${p.sku ?? idx}-${idx}`} className={cn(rowClass, bordaGrupo)}>
                        <TableCell>
                          {p.imagem_url ? (
                            <img src={p.imagem_url} alt="" loading="lazy" className="h-10 w-10 rounded object-cover" />
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
                                <span className="block truncate cursor-default">{p.produto ?? "—"}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-md">
                                {p.produto ?? "—"}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground/40">↳</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{p.variacao ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.sku ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(p.preco_atual)}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.estoque_disponivel ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.vendidos_periodo.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.media_diaria.toFixed(2)}</TableCell>
                        <TableCell className={`text-right ${diasClass}`}>
                          {diasEstoque == null ? "—" : diasEstoque.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{brl(p.custo_unitario)}</TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
}