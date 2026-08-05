import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, BellOff, Loader2, Send, Smartphone, Trash2, Info, MessageCircle, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getPushConfig,
  salvarDispositivoPush,
  removerDispositivoPush,
  enviarPushTeste,
} from "@/lib/push.functions";
import {
  assinarPush,
  assinaturaAtual,
  cancelarPush,
  ehIOS,
  instaladoNaTelaInicial,
  pushSuportado,
} from "@/lib/push-client";

type Dispositivo = {
  id: string;
  apelido: string | null;
  user_agent: string | null;
  created_at: string;
  ultimo_envio_em: string | null;
};

export function PushNotificacoes() {
  const qc = useQueryClient();
  const configFn = useServerFn(getPushConfig);
  const salvarFn = useServerFn(salvarDispositivoPush);
  const removerFn = useServerFn(removerDispositivoPush);
  const testeFn = useServerFn(enviarPushTeste);

  const [suportado, setSuportado] = useState<boolean | null>(null);
  const [assinado, setAssinado] = useState(false);

  const { data: tags, isLoading: loadTags } = useQuery({
    queryKey: ["push-tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("config")
        .select("push_venda_ativo, push_chat_ativo")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return {
        venda: (data as { push_venda_ativo?: boolean } | null)?.push_venda_ativo !== false,
        chat: (data as { push_chat_ativo?: boolean } | null)?.push_chat_ativo !== false,
      };
    },
  });

  const tagMut = useMutation({
    mutationFn: async (patch: { push_venda_ativo?: boolean; push_chat_ativo?: boolean }) => {
      const { error } = await supabase.from("config").update(patch as never).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Preferência salva");
      qc.invalidateQueries({ queryKey: ["push-tags"] });
    },
    onError: (e: Error) => toast.error("Erro ao salvar", { description: e.message }),
  });

  useEffect(() => {
    const ok = pushSuportado();
    setSuportado(ok);
    if (!ok) return;
    assinaturaAtual().then((s) => setAssinado(Boolean(s)));
  }, []);

  const { data: config } = useQuery({
    queryKey: ["push-config"],
    queryFn: async () => await configFn(),
  });

  const { data: dispositivos = [], isLoading } = useQuery<Dispositivo[]>({
    queryKey: ["push-dispositivos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("push_dispositivos" as never)
        .select("id, apelido, user_agent, created_at, ultimo_envio_em")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Dispositivo[];
    },
  });

  const ativarMut = useMutation({
    mutationFn: async () => {
      if (!config?.publicKey) throw new Error("Chaves de push não configuradas no servidor");
      const sub = await assinarPush(config.publicKey);
      const r = await salvarFn({
        data: {
          ...sub,
          apelido: apelidoDoNavegador(),
          userAgent: navigator.userAgent.slice(0, 300),
        },
      });
      if (!r?.ok) throw new Error(r?.error ?? "falha ao registrar dispositivo");
      return r;
    },
    onSuccess: () => {
      setAssinado(true);
      toast.success("Notificações ativadas neste aparelho");
      qc.invalidateQueries({ queryKey: ["push-dispositivos"] });
    },
    onError: (e: Error) => toast.error("Não foi possível ativar", { description: e.message }),
  });

  const desativarMut = useMutation({
    mutationFn: async () => {
      const endpoint = await cancelarPush();
      if (endpoint) await removerFn({ data: { endpoint } });
    },
    onSuccess: () => {
      setAssinado(false);
      toast.success("Notificações desativadas neste aparelho");
      qc.invalidateQueries({ queryKey: ["push-dispositivos"] });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const testeMut = useMutation({
    mutationFn: async () => await testeFn(),
    onSuccess: (r: { ok?: boolean; sucesso?: number; error?: string }) => {
      if (r?.ok) toast.success(`Push enviado para ${r.sucesso} aparelho(s)`);
      else toast.error("Nenhum push enviado", { description: r?.error ?? "verifique os dispositivos" });
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const removerMut = useMutation({
    mutationFn: async (id: string) => await removerFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Aparelho removido");
      qc.invalidateQueries({ queryKey: ["push-dispositivos"] });
    },
  });

  const iosSemInstalar = ehIOS() && !instaladoNaTelaInicial();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" /> Notificações no celular (PWA)
        </CardTitle>
        <CardDescription>
          Receba um alerta na tela do aparelho a cada nova venda sincronizada da Shopee.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {suportado === false && (
          <p className="rounded-md border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/10 p-3 text-sm">
            Este navegador não suporta notificações push. Use Chrome no Android ou instale o app na
            tela inicial no iPhone (iOS 16.4+).
          </p>
        )}

        {iosSemInstalar && (
          <p className="flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            No iPhone é obrigatório adicionar o Dream Ice à Tela de Início (Compartilhar → Adicionar
            à Tela de Início) e ativar as notificações de dentro do app instalado.
          </p>
        )}

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Quais alertas receber</p>
          {loadTags ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <Label htmlFor="tag-venda" className="flex items-center gap-2 font-medium">
                    <ShoppingBag className="h-3.5 w-3.5" /> Vendas
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">Push a cada novo pedido.</p>
                </div>
                <Switch
                  id="tag-venda"
                  checked={tags?.venda ?? true}
                  disabled={tagMut.isPending}
                  onCheckedChange={(v) => tagMut.mutate({ push_venda_ativo: v })}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <Label htmlFor="tag-chat" className="flex items-center gap-2 font-medium">
                    <MessageCircle className="h-3.5 w-3.5" /> Chat
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">Push a cada mensagem do cliente.</p>
                </div>
                <Switch
                  id="tag-chat"
                  checked={tags?.chat ?? true}
                  disabled={tagMut.isPending}
                  onCheckedChange={(v) => tagMut.mutate({ push_chat_ativo: v })}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {assinado ? (
            <Button variant="outline" onClick={() => desativarMut.mutate()} disabled={desativarMut.isPending}>
              {desativarMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellOff className="mr-2 h-4 w-4" />}
              Desativar neste aparelho
            </Button>
          ) : (
            <Button onClick={() => ativarMut.mutate()} disabled={!suportado || ativarMut.isPending || !config?.configurado}>
              {ativarMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
              Ativar neste aparelho
            </Button>
          )}
          <Button variant="outline" onClick={() => testeMut.mutate()} disabled={testeMut.isPending || dispositivos.length === 0}>
            {testeMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar push de teste
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Aparelhos registrados</p>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : dispositivos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum aparelho registrado ainda.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {dispositivos.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Smartphone className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{d.apelido ?? "Aparelho"}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Registrado em {new Date(d.created_at).toLocaleString("pt-BR")}
                      {d.ultimo_envio_em
                        ? ` · último envio ${new Date(d.ultimo_envio_em).toLocaleString("pt-BR")}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remover aparelho"
                    onClick={() => removerMut.mutate(d.id)}
                    disabled={removerMut.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function apelidoDoNavegador() {
  const ua = navigator.userAgent;
  const so = /iPhone|iPad/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Mac/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : "Navegador";
  const nav = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Safari\//.test(ua)
        ? "Safari"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : "";
  return [so, nav].filter(Boolean).join(" · ");
}