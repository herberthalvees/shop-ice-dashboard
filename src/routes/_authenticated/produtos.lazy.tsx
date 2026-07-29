import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ImageOff } from "lucide-react";

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
};

function ProdutosPage() {
  const [busca, setBusca] = useState("");
  const [somenteRisco, setSomenteRisco] = useState(false);
  const [dias, setDias] = useState<number>(30);

  const { data, isLoading } = useQuery({
    queryKey: ["produtos-giro", dias],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("produtos_com_giro" as any, { p_dias: dias });
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
    // Ordenar por dias_de_estoque crescente, nulos por último
    return [...base].sort((a, b) => {
      const da = a.dias_de_estoque;
      const db = b.dias_de_estoque;
      if (da == null && db == null) return b.vendidos_periodo - a.vendidos_periodo;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  }, [data, busca, somenteRisco]);

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
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]"></TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Variação</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead className="text-right">Vendidos</TableHead>
                  <TableHead className="text-right">Média/dia</TableHead>
                  <TableHead className="text-right">Dias de estoque</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(8)].map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
                  ))
                ) : linhas.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-sm text-muted-foreground">
                    Nenhum produto. Sincronize a loja em Configurações.
                  </TableCell></TableRow>
                ) : (
                  linhas.map((p, idx) => {
                    const dias = p.dias_de_estoque;
                    let rowClass = "";
                    let diasClass = "tabular-nums";
                    if (dias != null) {
                      if (dias < 7) { rowClass = "bg-destructive/10 hover:bg-destructive/15"; diasClass = "tabular-nums font-semibold text-destructive"; }
                      else if (dias < 15) { rowClass = "bg-amber-500/10 hover:bg-amber-500/15"; diasClass = "tabular-nums font-semibold text-amber-500"; }
                    }
                    return (
                      <TableRow key={`${p.sku ?? idx}-${idx}`} className={rowClass}>
                        <TableCell>
                          {p.imagem_url ? (
                            <img src={p.imagem_url} alt="" loading="lazy" className="h-10 w-10 rounded object-cover" />
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-muted-foreground">
                              <ImageOff className="h-4 w-4" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium max-w-[280px] truncate" title={p.produto ?? ""}>{p.produto ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{p.variacao ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.sku ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(p.preco_atual)}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.estoque_disponivel ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.vendidos_periodo.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.media_diaria.toFixed(2)}</TableCell>
                        <TableCell className={`text-right ${diasClass}`}>
                          {dias == null ? "—" : dias.toFixed(1)}
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