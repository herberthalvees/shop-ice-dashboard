import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, Loader2, CheckCircle2, XCircle, CalendarClock } from "lucide-react";
import { sendTestNotification, enviarResumoAgora } from "@/lib/shopee.functions";

export const Route = createLazyFileRoute("/_authenticated/notificacoes")({
  component: NotifPage,
});

const TIPOS = [
  { key: "novo_pedido", label: "Novo pedido" },
  { key: "pedido_cancelado", label: "Pedido cancelado" },
  { key: "pedido_enviado", label: "Pedido enviado" },
  { key: "estoque_baixo", label: "Estoque baixo" },
  { key: "resumo_diario", label: "Resumo diário (01:00)" },
] as const;

function NotifPage() {
  const qc = useQueryClient();
  const testFn = useServerFn(sendTestNotification);
  const resumoFn = useServerFn(enviarResumoAgora);
  const [dataResumo, setDataResumo] = useState("");
  const [previa, setPrevia] = useState<string | null>(null);

  const { data: cfg, isLoading } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const { data } = await supabase.from("config").select("*").eq("id", 1).maybeSingle();
      return data;
    },
  });

  const [url, setUrl] = useState("");
  const [ativos, setAtivos] = useState<Record<string, boolean>>({});
  const [limite, setLimite] = useState(5);
  const [ativas, setAtivas] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!cfg) return;
    setUrl(cfg.webhook_whatsapp_url ?? "");
    setAtivos((cfg.eventos as any) ?? {});
    setLimite(cfg.limite_estoque_baixo ?? 5);
    setAtivas(!!cfg.notificacoes_ativas);
  }, [cfg]);

  const { data: logs, isLoading: loadLogs } = useQuery({
    queryKey: ["eventos_log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("eventos_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  async function salvar() {
    setSaving(true);
    const { error } = await supabase.from("config").update({
      webhook_whatsapp_url: url || null,
      eventos: ativos,
      limite_estoque_baixo: limite,
      notificacoes_ativas: ativas,
    }).eq("id", 1);
    setSaving(false);
    if (error) toast.error("Erro ao salvar", { description: error.message });
    else { toast.success("Configurações salvas"); qc.invalidateQueries({ queryKey: ["config"] }); qc.invalidateQueries({ queryKey: ["config-limite"] }); }
  }

  const testMut = useMutation({
    mutationFn: async () => await testFn(),
    onSuccess: (r: any) => {
      if (r?.ok) toast.success("Teste enviado com sucesso");
      else toast.error("Falha no teste", { description: r?.error ?? `HTTP ${r?.status}` });
      qc.invalidateQueries({ queryKey: ["eventos_log"] });
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  const { data: resumos, isLoading: loadResumos } = useQuery({
    queryKey: ["alertas_enviados", "resumo_diario"],
    queryFn: async () => {
      const { data } = await supabase
        .from("alertas_enviados")
        .select("*")
        .eq("tipo", "resumo_diario")
        .order("chave", { ascending: false })
        .limit(15);
      return data ?? [];
    },
  });

  const resumoMut = useMutation({
    mutationFn: async () =>
      await resumoFn({ data: dataResumo ? { data: dataResumo } : {} } as any),
    onSuccess: (r: any) => {
      setPrevia(r?.mensagem ?? null);
      if (r?.enviado) toast.success(`Resumo de ${r.data_referencia} enviado`);
      else toast.error("Resumo não enviado", { description: r?.erro ?? "erro desconhecido" });
      qc.invalidateQueries({ queryKey: ["alertas_enviados", "resumo_diario"] });
    },
    onError: (e: any) => toast.error("Erro", { description: e.message }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
        <p className="text-sm text-muted-foreground">Encaminhe eventos da Shopee para o seu WhatsApp via webhook (n8n).</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook WhatsApp</CardTitle>
          <CardDescription>URL que receberá os eventos configurados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? <Skeleton className="h-40 w-full" /> : (
            <>
              <div className="space-y-2">
                <Label htmlFor="url">URL do webhook</Label>
                <Input id="url" placeholder="https://n8n.exemplo.com/webhook/…" value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="ativas" className="font-medium">Notificações ativas</Label>
                  <p className="text-xs text-muted-foreground">Desligado ignora todos os eventos.</p>
                </div>
                <Switch id="ativas" checked={ativas} onCheckedChange={setAtivas} />
              </div>
              <div className="space-y-2">
                <Label>Eventos habilitados</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {TIPOS.map((t) => (
                    <label key={t.key} className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent">
                      <Checkbox
                        checked={!!ativos[t.key]}
                        onCheckedChange={(v) => setAtivos({ ...ativos, [t.key]: !!v })}
                      />
                      <span className="text-sm">{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="limite">Limite de estoque baixo</Label>
                <Input id="limite" type="number" min={0} value={limite} onChange={(e) => setLimite(Number(e.target.value))} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={salvar} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
                <Button variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending || !url}>
                  {testMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Enviar teste
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico (últimos 50 eventos)</CardTitle>
        </CardHeader>
        <CardContent className="hidden" />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Resumo diário
          </CardTitle>
          <CardDescription>
            Enviado automaticamente todos os dias às 01:00 (Brasília) com os números do dia anterior.
            Controle o envio automático pelo evento “Resumo diário” acima.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="data-resumo">Data (opcional)</Label>
              <Input
                id="data-resumo"
                type="date"
                className="w-[180px]"
                value={dataResumo}
                onChange={(e) => setDataResumo(e.target.value)}
              />
            </div>
            <Button onClick={() => resumoMut.mutate()} disabled={resumoMut.isPending || !url}>
              {resumoMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Enviar resumo agora
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Sem data preenchida, envia o resumo de ontem.
          </p>

          {previa && (
            <pre className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-xs">
              {previa}
            </pre>
          )}

          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Últimos envios
            </Label>
            {loadResumos ? (
              <div className="mt-2 space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : (resumos ?? []).length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Nenhum resumo enviado ainda.
              </div>
            ) : (
              <div className="mt-2 divide-y divide-border">
                {(resumos ?? []).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      {r.enviado ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-[color:var(--success)]" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium">{r.chave}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {new Date(r.created_at).toLocaleString("pt-BR")}
                          {r.erro && <span className="text-destructive"> · {r.erro}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.detalhe?.mensagem && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPrevia(r.detalhe.mensagem)}
                        >
                          Ver
                        </Button>
                      )}
                      <Badge variant={r.enviado ? "secondary" : "destructive"}>
                        {r.enviado ? "enviado" : "falhou"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico (últimos 50 eventos)</CardTitle>
        </CardHeader>
        <CardContent>
          {loadLogs ? (
            <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (logs ?? []).length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Nenhum evento registrado ainda.</div>
          ) : (
            <div className="divide-y divide-border">
              {(logs ?? []).map((l) => (
                <div key={l.id} className="flex items-center justify-between py-3 gap-3 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    {l.notificado ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[color:var(--success)]" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium">{l.tipo_evento}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {new Date(l.created_at).toLocaleString("pt-BR")}
                        {l.erro && <span className="text-destructive"> · {l.erro}</span>}
                      </div>
                    </div>
                  </div>
                  <Badge variant={l.notificado ? "secondary" : "destructive"}>
                    {l.notificado ? "notificado" : "não enviado"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}