import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: () => ({ meta: [{ title: "Produtos — Dream Ice" }] }),
  component: ProdutosPage,
});

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function ProdutosPage() {
  const [busca, setBusca] = useState("");
  const [somenteBaixo, setSomenteBaixo] = useState(false);

  const { data: cfg } = useQuery({
    queryKey: ["config-limite"],
    queryFn: async () => {
      const { data } = await supabase.from("config").select("limite_estoque_baixo").eq("id", 1).maybeSingle();
      return data?.limite_estoque_baixo ?? 5;
    },
  });

  const limite = cfg ?? 5;

  const { data, isLoading } = useQuery({
    queryKey: ["produtos", busca, somenteBaixo, limite],
    queryFn: async () => {
      let q = supabase.from("produtos").select("*").order("estoque", { ascending: true });
      if (busca.trim()) {
        const b = busca.trim();
        q = q.or(`nome.ilike.%${b}%,sku.ilike.%${b}%`);
      }
      if (somenteBaixo) q = q.lte("estoque", limite);
      const { data } = await q.limit(500);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
        <p className="text-sm text-muted-foreground">
          Limite de estoque baixo: {limite} unidades. Ajuste em Notificações.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por nome ou SKU…" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="baixo" checked={somenteBaixo} onCheckedChange={setSomenteBaixo} />
              <Label htmlFor="baixo" className="cursor-pointer">Somente estoque baixo</Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Estoque</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(6)].map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                  ))
                ) : (data ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-sm text-muted-foreground">
                    Nenhum produto. Sincronize a loja em Configurações.
                  </TableCell></TableRow>
                ) : (
                  (data ?? []).map((p) => {
                    const baixo = (p.estoque ?? 0) <= limite;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium max-w-md truncate">{p.nome ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{p.sku ?? "—"}</TableCell>
                        <TableCell className="tabular-nums">{brl(Number(p.preco ?? 0))}</TableCell>
                        <TableCell>
                          <span className={baixo ? "inline-flex items-center gap-1 font-semibold text-destructive" : "tabular-nums"}>
                            {baixo && <AlertTriangle className="h-3.5 w-3.5" />}
                            {p.estoque ?? 0}
                          </span>
                        </TableCell>
                        <TableCell><Badge variant="secondary">{p.status ?? "—"}</Badge></TableCell>
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