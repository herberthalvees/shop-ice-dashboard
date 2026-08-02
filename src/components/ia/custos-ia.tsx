import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles } from "lucide-react";

type Uso = {
  id: string;
  conversa_id: string | null;
  modelo: string;
  tokens_entrada: number;
  tokens_saida: number;
  passos: number;
  custo_creditos: number;
  created_at: string;
};

const num = (v: number) => v.toLocaleString("pt-BR");
const cred = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export function CustosIA() {
  const { data, isLoading } = useQuery<Uso[]>({
    queryKey: ["ia-uso"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ia_uso" as never)
        .select("id, conversa_id, modelo, tokens_entrada, tokens_saida, passos, custo_creditos, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Uso[];
    },
    staleTime: 30_000,
  });

  const linhas = data ?? [];
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const doMes = linhas.filter((l) => new Date(l.created_at) >= inicioMes);
  const total = (arr: Uso[]) => arr.reduce((s, l) => s + Number(l.custo_creditos || 0), 0);
  const tokens = (arr: Uso[]) =>
    arr.reduce((s, l) => s + (l.tokens_entrada || 0) + (l.tokens_saida || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> Custos da IA
        </CardTitle>
        <CardDescription>
          Consumo do DreamAI por interação. Créditos são uma estimativa baseada na tarifa por
          tokens do modelo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma interação registrada ainda. Use o DreamAI para começar o histórico.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Resumo k="Créditos no mês" v={cred(total(doMes))} />
              <Resumo k="Interações no mês" v={num(doMes.length)} />
              <Resumo k="Tokens no mês" v={num(tokens(doMes))} />
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Quando</th>
                    <th className="px-3 py-2 text-right font-medium">Entrada</th>
                    <th className="px-3 py-2 text-right font-medium">Saída</th>
                    <th className="px-3 py-2 text-right font-medium">Passos</th>
                    <th className="px-3 py-2 text-right font-medium">Créditos</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(l.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(l.tokens_entrada)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(l.tokens_saida)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num(l.passos)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {cred(Number(l.custo_creditos || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Mostrando as últimas {linhas.length} interações · modelo {linhas[0]?.modelo}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Resumo({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{v}</div>
    </div>
  );
}