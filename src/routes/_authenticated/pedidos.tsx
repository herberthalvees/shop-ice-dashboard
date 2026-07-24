import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Download, Search, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos — Dream Ice" }] }),
  component: PedidosPage,
});

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS = ["", "UNPAID", "TO_SHIP", "READY_TO_SHIP", "SHIPPED", "COMPLETED", "CANCELLED", "TO_RETURN"];

type SortKey = "data" | "valor";

function PedidosPage() {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [periodo, setPeriodo] = useState<"7" | "30" | "90" | "all">("30");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortKey>("data");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [aberto, setAberto] = useState<any | null>(null);
  const pageSize = 20;

  const dateFrom = useMemo(() => {
    if (periodo === "all") return null;
    const d = new Date();
    d.setDate(d.getDate() - Number(periodo));
    return d.toISOString();
  }, [periodo]);

  const { data, isLoading } = useQuery({
    queryKey: ["pedidos", busca, status, periodo, page, sort, sortDir],
    queryFn: async () => {
      let q = supabase.from("pedidos").select("*", { count: "exact" });
      if (busca.trim()) {
        const b = busca.trim();
        q = q.or(`order_sn.ilike.%${b}%,comprador_username.ilike.%${b}%`);
      }
      if (status) q = q.eq("status", status);
      if (dateFrom) q = q.gte("data_criacao_pedido", dateFrom);
      const sortCol = sort === "data" ? "data_criacao_pedido" : "valor_total";
      q = q.order(sortCol, { ascending: sortDir === "asc", nullsFirst: false });
      q = q.range(page * pageSize, page * pageSize + pageSize - 1);
      const { data, count } = await q;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const totalPages = Math.max(1, Math.ceil((data?.count ?? 0) / pageSize));

  function toggleSort(k: SortKey) {
    if (sort === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSort(k); setSortDir("desc"); }
  }

  function exportCSV() {
    const rows = data?.rows ?? [];
    const header = ["order_sn", "status", "comprador", "valor_total", "data_criacao"];
    const csv = [
      header.join(","),
      ...rows.map((r) => [
        r.order_sn,
        r.status ?? "",
        r.comprador_username ?? "",
        r.valor_total ?? 0,
        r.data_criacao_pedido ?? "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pedidos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
          <p className="text-sm text-muted-foreground">{data?.count ?? 0} pedidos no filtro atual</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data?.rows?.length}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por SN ou comprador…"
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <Select value={status || "todos"} onValueChange={(v) => { setStatus(v === "todos" ? "" : v); setPage(0); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {STATUS.filter(Boolean).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={periodo} onValueChange={(v) => { setPeriodo(v as any); setPage(0); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7d</SelectItem>
                <SelectItem value="30">Últimos 30d</SelectItem>
                <SelectItem value="90">Últimos 90d</SelectItem>
                <SelectItem value="all">Todo período</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order SN</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Comprador</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("valor")}>
                    <span className="inline-flex items-center gap-1">Valor <ArrowUpDown className="h-3 w-3" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("data")}>
                    <span className="inline-flex items-center gap-1">Data <ArrowUpDown className="h-3 w-3" /></span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                  ))
                ) : (data?.rows ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">Nenhum pedido encontrado.</TableCell></TableRow>
                ) : (
                  (data?.rows ?? []).map((p) => (
                    <TableRow key={p.order_sn} className="cursor-pointer" onClick={() => setAberto(p)}>
                      <TableCell className="font-medium">#{p.order_sn}</TableCell>
                      <TableCell><Badge variant="secondary">{p.status ?? "—"}</Badge></TableCell>
                      <TableCell>{p.comprador_username ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{brl(Number(p.valor_total ?? 0))}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {p.data_criacao_pedido ? new Date(p.data_criacao_pedido).toLocaleString("pt-BR") : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-muted-foreground">Página {page + 1} de {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {aberto && (
            <>
              <SheetHeader>
                <SheetTitle>Pedido #{aberto.order_sn}</SheetTitle>
                <SheetDescription>
                  {aberto.data_criacao_pedido
                    ? new Date(aberto.data_criacao_pedido).toLocaleString("pt-BR")
                    : ""}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <Row k="Status" v={<Badge variant="secondary">{aberto.status ?? "—"}</Badge>} />
                <Row k="Comprador" v={aberto.comprador_username ?? "—"} />
                <Row k="Valor total" v={<span className="font-semibold tabular-nums">{brl(Number(aberto.valor_total ?? 0))}</span>} />
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Itens</div>
                  {Array.isArray(aberto.itens) && aberto.itens.length ? (
                    <div className="divide-y divide-border border rounded-md">
                      {aberto.itens.map((it: any, i: number) => (
                        <div key={i} className="p-3">
                          <div className="font-medium">{it.item_name ?? it.name ?? `Item ${it.item_id}`}</div>
                          <div className="text-xs text-muted-foreground">
                            {(it.model_name || it.model_sku) && <span>{it.model_name ?? it.model_sku} · </span>}
                            Qtd: {it.model_quantity_purchased ?? it.quantity ?? 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-xs">Sem itens.</div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
}