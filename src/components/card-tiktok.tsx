import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Music2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getTiktokAuthUrl, runTiktokSync } from "@/lib/tiktok.functions";

type ConexaoTiktok = {
  shop_id: string | null;
  shop_name: string | null;
  seller_name: string | null;
  status: string;
  token_expires_at: string | null;
};

export function CardTiktok() {
  const qc = useQueryClient();
  const authFn = useServerFn(getTiktokAuthUrl);
  const syncFn = useServerFn(runTiktokSync);

  const { data: conn, isLoading } = useQuery<ConexaoTiktok | null>({
    queryKey: ["tiktok-connection-status"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tiktok_connection_status" as any)
        .select("shop_id, shop_name, seller_name, status, token_expires_at")
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ConexaoTiktok) ?? null;
    },
    staleTime: 30_000,
  });

  const authMut = useMutation({
    mutationFn: async () => await authFn({}),
    onSuccess: (r: any) => {
      if (r?.ok && r.url) {
        window.location.href = r.url;
        return;
      }
      toast.error("Credenciais do TikTok Shop ausentes", {
        description: `Configure: ${(r?.faltando ?? []).join(", ")}`,
      });
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const syncMut = useMutation({
    mutationFn: async () => await syncFn({}),
    onSuccess: () => {
      toast.success("Sincronização do TikTok Shop concluída");
      qc.invalidateQueries();
    },
    onError: (e: any) => toast.error("Falha na sincronização", { description: e.message }),
  });

  const conectado = Boolean(conn?.shop_id) && conn?.status === "ativa";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Music2 className="h-4 w-4" /> TikTok Shop
        </CardTitle>
        <CardDescription>Pedidos, produtos e financeiro do TikTok Shop</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Situação</span>
              <Badge variant="outline" className={conectado ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : "border-muted-foreground/40 text-muted-foreground"}>
                {conectado ? "Conectado" : conn?.status === "expirada" ? "Expirada" : "Não conectado"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Loja</span>
              <span>{conn?.shop_name ?? conn?.seller_name ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Token válido até</span>
              <span className="tabular-nums">
                {conn?.token_expires_at
                  ? new Date(conn.token_expires_at).toLocaleString("pt-BR")
                  : "—"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => authMut.mutate()} disabled={authMut.isPending}>
                {authMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {conectado ? "Reconectar" : "Conectar TikTok Shop"}
              </Button>
              <Button
                variant="outline"
                onClick={() => syncMut.mutate()}
                disabled={syncMut.isPending || !conectado}
              >
                {syncMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sincronizar agora
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}