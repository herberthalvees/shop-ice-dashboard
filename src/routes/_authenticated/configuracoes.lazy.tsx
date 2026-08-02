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
import { Store, RefreshCw, Loader2, ExternalLink, Lock, AlertTriangle, Percent } from "lucide-react";
import { getShopeeAuthUrl, runShopeeSync } from "@/lib/shopee.functions";
import { CustosIA } from "@/components/ia/custos-ia";

export const Route = createLazyFileRoute("/_authenticated/configuracoes")({
  component: ConfigPage,
});

type Conexao = {
  id: number;
  app_tipo: string;
  partner_id: number | null;
  shop_id: number | null;
  shop_name: string | null;
  token_expires_at: string | null;
  status: string;
};

const NOMES_APP: Record<string, string> = {
  principal: "App principal (pedidos, produtos, financeiro)",
  ads: "App de Ads",
};

function ConfigPage() {
  const search = useSearch({ from: "/_authenticated/configuracoes" });
  const qc = useQueryClient();
  const authUrlFn = useServerFn(getShopeeAuthUrl);
  const syncFn = useServerFn(runShopeeSync);

  useEffect(() => {
    if (search.conectado === "1") {
      toast.success("Conexão Shopee concluída");
      qc.invalidateQueries({ queryKey: ["shopee-connections"] });
      qc.invalidateQueries({ queryKey: ["shopee-connection-status"] });
    } else if (search.conectado === "0") {
      toast.error("Falha ao conectar", { description: search.erro ?? "Tente novamente." });
    }
  }, [search.conectado, search.erro, qc]);

  const { data: conns = [], isLoading, error: conexoesError } = useQuery<Conexao[]>({
    queryKey: ["shopee-connections", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shopee_connection_status" as any)
        .select("id, app_tipo, partner_id, shop_id, shop_name, token_expires_at, status");
      if (error) throw error;
      if (!Array.isArray(data)) return [];
      return data as unknown as Conexao[];
    },
    staleTime: 30_000,
    retry: 2,
  });

  const authMut = useMutation({
    mutationFn: async (app: "principal" | "ads") => await authUrlFn({ data: { app } }),
    onSuccess: (r: any) => { if (r?.url) window.location.href = r.url; },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const syncMut = useMutation({
    mutationFn: async () => await syncFn(),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success("Sincronização concluída", { description: `${r.pedidos ?? 0} pedidos · ${r.produtos ?? 0} produtos` });
      else toast.error("Sync falhou", { description: r?.error ?? "erro" });
      qc.invalidateQueries({ queryKey: ["shopee-connections"] });
      qc.invalidateQueries({ queryKey: ["shopee-connection-status"] });
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const [senha, setSenha] = useState("");
  const [conf, setConf] = useState("");
  const [savingSenha, setSavingSenha] = useState(false);

  const { data: cfg } = useQuery({
    queryKey: ["config-fiscal"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("config")
        .select("aliquota_imposto")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data as { aliquota_imposto: number | null } | null);
    },
  });
  const [aliquota, setAliquota] = useState<string>("");
  const [savingAliq, setSavingAliq] = useState(false);
  useEffect(() => {
    if (cfg && aliquota === "") {
      setAliquota(String(cfg.aliquota_imposto ?? 0).replace(".", ","));
    }
  }, [cfg]);

  async function salvarAliquota(e: React.FormEvent) {
    e.preventDefault();
    const num = Number(aliquota.replace(",", "."));
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      return toast.error("Alíquota inválida", { description: "Informe um valor entre 0 e 100." });
    }
    setSavingAliq(true);
    const { error } = await supabase
      .from("config")
      .update({ aliquota_imposto: num })
      .eq("id", 1);
    setSavingAliq(false);
    if (error) toast.error("Erro", { description: error.message });
    else {
      toast.success("Alíquota atualizada");
      qc.invalidateQueries({ queryKey: ["config-fiscal"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
    }
  }

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return toast.error("Senha muito curta", { description: "Ao menos 8 caracteres." });
    if (senha !== conf) return toast.error("As senhas não coincidem");
    setSavingSenha(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSavingSenha(false);
    if (error) toast.error("Erro", { description: error.message });
    else { toast.success("Senha atualizada"); setSenha(""); setConf(""); }
  }

  const statusColor: Record<string, string> = {
    ativa: "bg-[color:var(--success)]/20 text-[color:var(--success)] border-[color:var(--success)]/30",
    expirada: "bg-[color:var(--warning)]/20 text-[color:var(--warning)] border-[color:var(--warning)]/30",
    revogada: "bg-destructive/20 text-destructive border-destructive/30",
  };

  const principal = conns.find((c) => c.app_tipo === "principal") ?? null;
  const ads = conns.find((c) => c.app_tipo === "ads") ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie as conexões com a Shopee e sua conta.</p>
      </div>

      {conexoesError && (
        <div role="alert" className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Não foi possível carregar as conexões.</p>
            <p className="mt-1 text-muted-foreground">Tente novamente em instantes.</p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          <CardConexao
            appTipo="principal"
            conexao={principal}
            statusColor={statusColor}
            conectando={authMut.isPending}
            onConectar={() => authMut.mutate("principal")}
            acaoExtra={
              <Button
                variant="outline"
                onClick={() => syncMut.mutate()}
                disabled={syncMut.isPending || principal?.status !== "ativa"}
              >
                {syncMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Sincronizar agora
              </Button>
            }
          />
          <CardConexao
            appTipo="ads"
            conexao={ads}
            statusColor={statusColor}
            conectando={authMut.isPending}
            onConectar={() => authMut.mutate("ads")}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> Trocar senha</CardTitle>
          <CardDescription>Atualize a senha usada para acessar o painel.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={trocarSenha} className="grid gap-4 sm:grid-cols-2 max-w-lg">
            <div className="space-y-2">
              <Label htmlFor="s1">Nova senha</Label>
              <Input id="s1" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s2">Confirmar</Label>
              <Input id="s2" type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={savingSenha || !senha}>
                {savingSenha && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Atualizar senha
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Percent className="h-4 w-4" /> Fiscal</CardTitle>
          <CardDescription>Percentual efetivo sobre faturamento, informado pelo seu contador.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={salvarAliquota} className="grid gap-4 sm:grid-cols-2 max-w-lg">
            <div className="space-y-2">
              <Label htmlFor="aliq">Alíquota de imposto (%)</Label>
              <Input
                id="aliq"
                inputMode="decimal"
                placeholder="0,00"
                value={aliquota}
                onChange={(e) => setAliquota(e.target.value.replace(/[^0-9,\.]/g, ""))}
              />
              <p className="text-xs text-muted-foreground">Aceita decimal com vírgula (ex.: 6,5).</p>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={savingAliq}>
                {savingAliq && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar alíquota
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <CustosIA />
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

function CardConexao({
  appTipo,
  conexao,
  statusColor,
  conectando,
  onConectar,
  acaoExtra,
}: {
  appTipo: "principal" | "ads";
  conexao: Conexao | null;
  statusColor: Record<string, string>;
  conectando: boolean;
  onConectar: () => void;
  acaoExtra?: React.ReactNode;
}) {
  const expiraMs = conexao?.token_expires_at
    ? new Date(conexao.token_expires_at).getTime() - Date.now()
    : null;
  const alerta = expiraMs !== null && expiraMs < 60 * 60 * 1000;
  const expirado = expiraMs !== null && expiraMs <= 0;
  const label = expiraMs === null
    ? "—"
    : expirado
      ? "Expirado"
      : `em ${Math.max(1, Math.floor(expiraMs / 60000))} min`;

  const rotuloBotao = conexao
    ? appTipo === "ads" ? "Reconectar app de Ads" : "Reconectar loja"
    : appTipo === "ads" ? "Conectar app de Ads" : "Conectar loja";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Store className="h-4 w-4" /> {NOMES_APP[appTipo]}
        </CardTitle>
        <CardDescription>
          {appTipo === "ads"
            ? "Autorize o app de Ads para acompanhar campanhas e investimento."
            : "Autorize o app principal para sincronizar pedidos, produtos e financeiro."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Info k="app_tipo" v={appTipo} />
          <Info k="partner_id" v={conexao?.partner_id ? String(conexao.partner_id) : "—"} />
          <Info k="Loja" v={conexao?.shop_name ?? "—"} />
          <Info k="shop_id" v={conexao?.shop_id ? String(conexao.shop_id) : "—"} />
          <Info k="Token expira em" v={
            <span className={`inline-flex items-center gap-1.5 ${alerta ? (expirado ? "text-destructive" : "text-[color:var(--warning)]") : ""}`}>
              {alerta && <AlertTriangle className="h-3.5 w-3.5" />}
              {conexao?.token_expires_at ? (
                <span>
                  {new Date(conexao.token_expires_at).toLocaleString("pt-BR")}
                  <span className="ml-1 text-xs opacity-80">({label})</span>
                </span>
              ) : "—"}
            </span>
          } />
          <Info k="Status" v={
            <span className={`inline-flex px-2 py-0.5 rounded border text-xs ${statusColor[conexao?.status ?? ""] ?? "bg-muted"}`}>
              {conexao?.status ?? "sem conexão"}
            </span>
          } />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onConectar} disabled={conectando}>
            {conectando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
            {rotuloBotao}
          </Button>
          {acaoExtra}
        </div>
      </CardContent>
    </Card>
  );
}