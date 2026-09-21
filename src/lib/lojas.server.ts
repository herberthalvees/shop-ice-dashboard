// Server-only: lista as lojas ativas para as rotinas de sincronização
// percorrerem uma a uma, em vez de assumirem uma única loja "principal".
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Loja = { id: number; nome: string };

export async function listarLojasAtivas(): Promise<Loja[]> {
  const { data, error } = await supabaseAdmin
    .from("lojas" as any)
    .select("id, nome")
    .eq("status", "ativa")
    .order("id");
  if (error) throw new Error(`falha ao listar lojas: ${error.message}`);
  return (data ?? []) as unknown as Loja[];
}
