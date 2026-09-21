import { createLazyFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Store, Loader2, ExternalLink, AlertTriangle, Plus, Power } from "lucide-react";
import { getShopeeAuthUrl } from "@/lib/shopee.functions";

export const Route = createLazyFileRoute("/_authenticated/lojas")({
  component: LojasPage,
});

type Loja = { id: number; nome: string; status: "ativa" | "inativa"; created_at: string };

type Conexao = {
  id: number;
  loja_id: number;
  app_tipo: string;
  partner_id: number | null;
  shop_id: number | null;
  shop_name: string | null;
  token_expires_at: string | null;
  status: string;
};

const NOMES_APP: Record<string, string> = {
  principal: "App principal",
  ads: "App de Ads",
};

const statusColor: Record<string, string> = {
  ativa:
    "bg-[color:var(--success)]/20 text-[color:var(--success)] border-[color:var(--success)]/30",
  expirada:
    "bg-[color:var(--warning)]/20 text-[color:var(--warning)] border-[color:var(--warning)]/30",
  revogada: "bg-destructive/20 text-destructive border-destructive/30",
};

function LojasPage() {
  const search = useSearch({ from: "/_authenticated/lojas" });
  const qc = useQueryClient();
  const authUrlFn = useServerFn(getShopeeAuthUrl);

  useEffect(() => {
    if (search.conectado === "1") {
      toast.success("Conexão Shopee concluída");
      qc.invalidateQueries({ queryKey: ["lojas"] });
      qc.invalidateQueries({ queryKey: ["shopee-connections"] });
    } else if (search.conectado === "0") {
      toast.error("Falha ao conectar", { description: search.erro ?? "Tente novamente." });
    }
  }, [search.conectado, search.erro, qc]);

  const {
    data: lojas = [],
    isLoading: carregandoLojas,
    error: lojasError,
  } = useQuery<Loja[]>({
    queryKey: ["lojas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lojas" as any)
        .select("id, nome, status, created_at")
        .order("id");
      if (error) throw error;
      return (data ?? []) as unknown as Loja[];
    },
  });

  const { data: conexoes = [] } = useQuery<Conexao[]>({
    queryKey: ["shopee-connections", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopee_connection_status" as any)
        .select("id, loja_id, app_tipo, partner_id, shop_id, shop_name, token_expires_at, status");
      if (error) throw error;
      return (data ?? []) as unknown as Conexao[];
    },
    staleTime: 30_000,
  });

  const [novoNome, setNovoNome] = useState("");

  const criarMut = useMutation({
    mutationFn: async (nome: string) => {
      const { error } = await supabase.from("lojas" as any).insert({ nome });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Loja cadastrada");
      setNovoNome("");
      qc.invalidateQueries({ queryKey: ["lojas"] });
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "ativa" | "inativa" }) => {
      const { error } = await supabase
        .from("lojas" as any)
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lojas"] });
      toast.success("Loja atualizada");
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const authMut = useMutation({
    mutationFn: async ({ app, lojaId }: { app: "principal" | "ads"; lojaId: number }) =>
      await authUrlFn({ data: { app, lojaId } }),
    onSuccess: (r: any) => {
      if (r?.url) window.location.href = r.url;
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  function handleCriar(e: React.FormEvent) {
    e.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return toast.error("Informe um nome para a loja");
    criarMut.mutate(nome);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lojas</h1>
        <p className="text-sm text-muted-foreground">
          Cadastre cada loja Shopee e conecte suas credenciais. As demais telas do painel poderão
          filtrar por loja assim que houver mais de uma conectada.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Plus className="h-4 w-4" /> Adicionar loja
          </CardTitle>
          <CardDescription>Dê um nome para identificar a loja (ex.: "Loja 2").</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleCriar}
            className="flex flex-col gap-3 sm:flex-row sm:items-end max-w-lg"
          >
            <div className="flex-1 space-y-2">
              <Label htmlFor="nome-loja">Nome da loja</Label>
              <Input
                id="nome-loja"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Loja 2"
              />
            </div>
            <Button type="submit" disabled={criarMut.isPending}>
              {criarMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Adicionar
            </Button>
          </form>
        </CardContent>
      </Card>

      {lojasError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Não foi possível carregar as lojas.</p>
            <p className="mt-1 text-muted-foreground">Tente novamente em instantes.</p>
          </div>
        </div>
      )}

      {carregandoLojas ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : lojas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma loja cadastrada ainda.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {lojas.map((loja) => (
            <CardLoja
              key={loja.id}
              loja={loja}
              conexoes={conexoes.filter((c) => c.loja_id === loja.id)}
              conectando={authMut.isPending}
              onConectar={(app) => authMut.mutate({ app, lojaId: loja.id })}
              onAlternarStatus={() =>
                statusMut.mutate({
                  id: loja.id,
                  status: loja.status === "ativa" ? "inativa" : "ativa",
                })
              }
              alternandoStatus={statusMut.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="mt-1 text-sm font-medium">{v}</div>
    </div>
  );
}

function CardLoja({
  loja,
  conexoes,
  conectando,
  onConectar,
  onAlternarStatus,
  alternandoStatus,
}: {
  loja: { id: number; nome: string; status: "ativa" | "inativa" };
  conexoes: Conexao[];
  conectando: boolean;
  onConectar: (app: "principal" | "ads") => void;
  onAlternarStatus: () => void;
  alternandoStatus: boolean;
}) {
  const principal = conexoes.find((c) => c.app_tipo === "principal") ?? null;
  const ads = conexoes.find((c) => c.app_tipo === "ads") ?? null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Store className="h-4 w-4" /> {loja.nome}
            </CardTitle>
            <CardDescription>
              {principal?.shop_name ? `Shopee: ${principal.shop_name}` : "Ainda não conectada"}
            </CardDescription>
          </div>
          <span
            className={`inline-flex shrink-0 items-center px-2 py-0.5 rounded border text-xs ${
              loja.status === "ativa"
                ? "bg-[color:var(--success)]/20 text-[color:var(--success)] border-[color:var(--success)]/30"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {loja.status}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(["principal", "ads"] as const).map((app) => {
          const conexao = app === "principal" ? principal : ads;
          const expiraMs = conexao?.token_expires_at
            ? new Date(conexao.token_expires_at).getTime() - Date.now()
            : null;
          const expirado = expiraMs !== null && expiraMs <= 0;
          return (
            <div key={app} className="rounded-md border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{NOMES_APP[app]}</span>
                <span
                  className={`inline-flex px-2 py-0.5 rounded border text-xs ${
                    statusColor[conexao?.status ?? ""] ?? "bg-muted"
                  }`}
                >
                  {conexao?.status ?? "sem conexão"}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Info k="shop_id" v={conexao?.shop_id ? String(conexao.shop_id) : "—"} />
                <Info
                  k="Token expira"
                  v={
                    conexao?.token_expires_at ? (
                      <span className={expirado ? "text-destructive" : ""}>
                        {new Date(conexao.token_expires_at).toLocaleString("pt-BR")}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onConectar(app)}
                disabled={conectando}
              >
                {conectando ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                {conexao ? "Reconectar" : "Conectar"}
              </Button>
            </div>
          );
        })}
        <Button size="sm" variant="ghost" onClick={onAlternarStatus} disabled={alternandoStatus}>
          {alternandoStatus ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Power className="mr-2 h-4 w-4" />
          )}
          {loja.status === "ativa" ? "Desativar loja" : "Reativar loja"}
        </Button>
      </CardContent>
    </Card>
  );
}
