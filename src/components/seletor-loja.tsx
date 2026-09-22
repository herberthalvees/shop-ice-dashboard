import { useQuery } from "@tanstack/react-query";
import { Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLojaFiltro } from "@/lib/lojas-filtro-store";

type Loja = { id: number; nome: string };

const TODAS = "todas";

/** Filtro global "Loja A / Loja B / Ambas" — só aparece quando há mais de uma loja ativa. */
export function SeletorLoja() {
  const { lojaId, setLojaId } = useLojaFiltro();

  const { data: lojas } = useQuery<Loja[]>({
    queryKey: ["lojas-ativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lojas" as any)
        .select("id, nome")
        .eq("status", "ativa")
        .order("id");
      if (error) throw error;
      return (data ?? []) as unknown as Loja[];
    },
    staleTime: 60_000,
  });

  if (!lojas || lojas.length <= 1) return null;

  return (
    <Select
      value={lojaId != null ? String(lojaId) : TODAS}
      onValueChange={(v) => setLojaId(v === TODAS ? null : Number(v))}
    >
      <SelectTrigger className="w-[160px] gap-1.5">
        <Store className="size-4 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Loja" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODAS}>Ambas as lojas</SelectItem>
        {lojas.map((l) => (
          <SelectItem key={l.id} value={String(l.id)}>
            {l.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
