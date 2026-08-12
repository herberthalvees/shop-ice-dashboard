import { createLazyFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Send, Sparkles, Star, Trash2 } from "lucide-react";
import {
  enviarRespostaAvaliacaoShopee,
  gerarRespostaAvaliacaoIA,
  sincronizarAvaliacoesShopee,
} from "@/lib/avaliacoes.functions";

export const Route = createLazyFileRoute("/_authenticated/avaliacoes")({
  component: AvaliacoesPage,
});

type Avaliacao = {
  comment_id: number;
  produto: string | null;
  comprador: string | null;
  rating: number | null;
  comentario: string | null;
  criado_em: string | null;
  resposta_shopee: string | null;
  resposta_gerada: string | null;
  respondida: boolean;
  status: string;
  erro: string | null;
};

type Exemplo = { id: string; estrelas: number; texto: string; ativo: boolean };

type Historico = {
  comment_id: number;
  produto: string | null;
  comprador: string | null;
  rating: number | null;
  comentario: string | null;
  resposta_shopee: string | null;
  resposta_gerada: string | null;
  enviada_em: string | null;
};

function dataCurta(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function Estrelas({ nota }: { nota: number | null }) {
  const n = Number(nota ?? 0);
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={
            "size-3.5 " + (i < n ? "fill-primary text-primary" : "text-muted-foreground/40")
          }
        />
      ))}
    </span>
  );
}

function AvaliacoesPage() {
  const qc = useQueryClient();
  const sincronizarFn = useServerFn(sincronizarAvaliacoesShopee);
  const gerarFn = useServerFn(gerarRespostaAvaliacaoIA);
  const enviarFn = useServerFn(enviarRespostaAvaliacaoShopee);

  const [filtro, setFiltro] = useState<"pendentes" | "todas">("pendentes");
  const [rascunhos, setRascunhos] = useState<Record<number, string>>({});
  const [ocupado, setOcupado] = useState<number | null>(null);

  const avaliacoes = useQuery({
    queryKey: ["avaliacoes", filtro],
    queryFn: async () => {
      let q = supabase
        .from("avaliacoes")
        .select(
          "comment_id, produto, comprador, rating, comentario, criado_em, resposta_shopee, resposta_gerada, respondida, status, erro",
        )
        .order("criado_em", { ascending: false })
        .limit(100);
      if (filtro === "pendentes") q = q.eq("respondida", false);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Avaliacao[];
    },
  });

  const config = useQuery({
    queryKey: ["config-avaliacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("config")
        .select("avaliacoes_auto_ativo, avaliacoes_prompt, avaliacoes_usar_ia")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const exemplos = useQuery({
    queryKey: ["avaliacoes-exemplos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avaliacoes_exemplos")
        .select("id, estrelas, texto, ativo")
        .order("estrelas", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Exemplo[];
    },
  });

  const historico = useQuery({
    queryKey: ["avaliacoes-historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avaliacoes")
        .select(
          "comment_id, produto, comprador, rating, comentario, resposta_shopee, resposta_gerada, enviada_em",
        )
        .eq("respondida", true)
        .order("enviada_em", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Historico[];
    },
  });

  const sincronizar = useMutation({
    mutationFn: async () => {
      const r = await sincronizarFn();
      if (!r.ok) throw new Error((r as { error: string }).error);
      return r;
    },
    onSuccess: (r) => {
      toast.success(`${r.encontradas} avaliações verificadas`, {
        description: `${r.novas} sem resposta.`,
      });
      qc.invalidateQueries({ queryKey: ["avaliacoes"] });
    },
    onError: (e: Error) => toast.error("Falha ao sincronizar", { description: e.message }),
  });

  async function gerar(id: number) {
    setOcupado(id);
    try {
      const r = await gerarFn({ data: { commentId: id } });
      if (!r.ok) throw new Error((r as { error: string }).error);
      setRascunhos((prev) => ({ ...prev, [id]: r.texto }));
      toast.success("Resposta gerada pelo DreamAI");
    } catch (e) {
      toast.error("Não foi possível gerar", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setOcupado(null);
    }
  }

  async function enviar(id: number, texto: string) {
    if (!texto.trim()) {
      toast.error("Escreva ou gere uma resposta antes de enviar");
      return;
    }
    setOcupado(id);
    try {
      const r = await enviarFn({ data: { commentId: id, texto } });
      if (!r.ok) throw new Error((r as { error: string }).error);
      toast.success("Resposta publicada na Shopee");
      qc.invalidateQueries({ queryKey: ["avaliacoes"] });
    } catch (e) {
      toast.error("Não foi possível enviar", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setOcupado(null);
    }
  }

  async function salvarConfig(campos: {
    avaliacoes_auto_ativo?: boolean;
    avaliacoes_prompt?: string;
    avaliacoes_usar_ia?: boolean;
  }) {
    const { error } = await supabase.from("config").update(campos).eq("id", 1);
    if (error) toast.error("Erro ao salvar", { description: error.message });
    else {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["config-avaliacoes"] });
    }
  }

  const lista = avaliacoes.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Avaliações</h1>
          <p className="text-sm text-muted-foreground">
            Respostas geradas pelo DreamAI a partir do comentário do cliente.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => sincronizar.mutate()}
          disabled={sincronizar.isPending}
        >
          {sincronizar.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Buscar na Shopee
        </Button>
      </header>

      <Tabs defaultValue="lista">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="lista">Avaliações</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="modelos">Respostas de referência</TabsTrigger>
          <TabsTrigger value="ajustes">Automação</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Select value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendentes">Sem resposta</SelectItem>
                <SelectItem value="todas">Todas</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{lista.length} avaliações</span>
          </div>

          {avaliacoes.isLoading &&
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}

          {!avaliacoes.isLoading && lista.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma avaliação por aqui. Clique em “Buscar na Shopee”.
              </CardContent>
            </Card>
          )}

          {lista.map((a) => {
            const texto = rascunhos[a.comment_id] ?? a.resposta_gerada ?? "";
            const trabalhando = ocupado === a.comment_id;
            return (
              <Card key={a.comment_id}>
                <CardHeader className="gap-1 pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Estrelas nota={a.rating} />
                    <span className="text-sm font-medium">{a.comprador ?? "Cliente"}</span>
                    <span className="text-xs text-muted-foreground">{dataCurta(a.criado_em)}</span>
                    {a.respondida ? (
                      <Badge variant="secondary">Respondida</Badge>
                    ) : (
                      <Badge>Pendente</Badge>
                    )}
                  </div>
                  {a.produto && (
                    <CardDescription className="truncate">{a.produto}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/40 p-3 text-sm">
                    {a.comentario?.trim() || "(sem comentário, apenas a nota)"}
                  </p>

                  {a.respondida ? (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm whitespace-pre-wrap">
                      <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-primary">
                        Resposta da loja
                      </span>
                      {a.resposta_shopee}
                    </div>
                  ) : (
                    <>
                      <Textarea
                        value={texto}
                        rows={3}
                        placeholder="Gere com o DreamAI ou escreva a resposta…"
                        onChange={(e) =>
                          setRascunhos((prev) => ({ ...prev, [a.comment_id]: e.target.value }))
                        }
                      />
                      {a.erro && <p className="text-xs text-destructive">{a.erro}</p>}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={trabalhando}
                          onClick={() => gerar(a.comment_id)}
                        >
                          {trabalhando ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Sparkles className="size-4" />
                          )}
                          Gerar com DreamAI
                        </Button>
                        <Button
                          size="sm"
                          disabled={trabalhando || !texto.trim()}
                          onClick={() => enviar(a.comment_id, texto)}
                        >
                          <Send className="size-4" /> Publicar
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <HistoricoRespostas
            itens={historico.data ?? []}
            carregando={historico.isLoading}
            onAtualizar={() => qc.invalidateQueries({ queryKey: ["avaliacoes-historico"] })}
          />
        </TabsContent>

        <TabsContent value="modelos" className="mt-4">
          <Modelos exemplos={exemplos.data ?? []} carregando={exemplos.isLoading} />
        </TabsContent>

        <TabsContent value="ajustes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resposta automática</CardTitle>
              <CardDescription>
                Quando ligada, o painel responde sozinho as avaliações novas a cada hora, usando o
                DreamAI e suas respostas de referência.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                <Label htmlFor="auto-aval">Responder automaticamente</Label>
                <Switch
                  id="auto-aval"
                  checked={Boolean(config.data?.avaliacoes_auto_ativo)}
                  onCheckedChange={(v) => salvarConfig({ avaliacoes_auto_ativo: v })}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                <div className="min-w-0">
                  <Label htmlFor="ia-aval">Usar IA para escrever</Label>
                  <p className="text-xs text-muted-foreground">
                    Ligado: o DreamAI escreve cada resposta. Desligado: usa apenas os textos prontos
                    da aba Respostas de referência.
                  </p>
                </div>
                <Switch
                  id="ia-aval"
                  checked={Boolean(config.data?.avaliacoes_usar_ia)}
                  onCheckedChange={(v) => salvarConfig({ avaliacoes_usar_ia: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prompt-aval">Orientações para o DreamAI</Label>
                <Textarea
                  id="prompt-aval"
                  rows={5}
                  defaultValue={config.data?.avaliacoes_prompt ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== config.data?.avaliacoes_prompt)
                      salvarConfig({ avaliacoes_prompt: v });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Tom de voz, o que pode e o que não pode ser dito. Salva ao sair do campo.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Modelos({ exemplos, carregando }: { exemplos: Exemplo[]; carregando: boolean }) {
  return <ModelosInner exemplos={exemplos} carregando={carregando} />;
}

function HistoricoRespostas({
  itens,
  carregando,
  onAtualizar,
}: {
  itens: Historico[];
  carregando: boolean;
  onAtualizar: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {itens.length} respostas publicadas (mais recentes primeiro)
        </span>
        <Button variant="ghost" size="sm" onClick={onAtualizar}>
          <RefreshCw className="size-4" /> Atualizar
        </Button>
      </div>

      {carregando && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}

      {!carregando && itens.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma resposta publicada ainda.
          </CardContent>
        </Card>
      )}

      {itens.map((a) => (
        <Card key={a.comment_id}>
          <CardHeader className="gap-1 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <Estrelas nota={a.rating} />
              <span className="text-sm font-medium">{a.comprador ?? "Cliente"}</span>
              {a.enviada_em && (
                <span className="text-xs text-muted-foreground">
                  respondida em {dataCurta(a.enviada_em)}
                </span>
              )}
              <Badge variant="secondary">
                {a.resposta_gerada && a.resposta_gerada === a.resposta_shopee
                  ? "DreamAI"
                  : "Publicada"}
              </Badge>
            </div>
            {a.produto && <CardDescription className="truncate">{a.produto}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/40 p-3 text-sm">
              {a.comentario?.trim() || "(sem comentário, apenas a nota)"}
            </p>
            <div className="whitespace-pre-wrap rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-primary">
                Resposta da loja
              </span>
              {a.resposta_shopee ?? a.resposta_gerada}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ModelosInner({ exemplos, carregando }: { exemplos: Exemplo[]; carregando: boolean }) {
  const qc = useQueryClient();
  const [estrelas, setEstrelas] = useState("5");
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function adicionar() {
    if (!texto.trim()) {
      toast.error("Escreva o texto de referência");
      return;
    }
    setSalvando(true);
    const { error } = await supabase
      .from("avaliacoes_exemplos")
      .insert({ estrelas: Number(estrelas), texto: texto.trim() });
    setSalvando(false);
    if (error) toast.error("Erro ao salvar", { description: error.message });
    else {
      setTexto("");
      toast.success("Referência adicionada");
      qc.invalidateQueries({ queryKey: ["avaliacoes-exemplos"] });
    }
  }

  async function excluir(id: string) {
    const { error } = await supabase.from("avaliacoes_exemplos").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else {
      toast.success("Referência excluída");
      qc.invalidateQueries({ queryKey: ["avaliacoes-exemplos"] });
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nova referência</CardTitle>
          <CardDescription>
            Cadastre suas respostas por nota. O DreamAI usa como base de estilo e varia as palavras.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select value={estrelas} onValueChange={setEstrelas}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 4, 3, 2, 1].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} estrela{n > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              placeholder="Ex.: Muito obrigado pela avaliação! Ficamos felizes que gostou do produto."
            />
          </div>
          <Button size="sm" onClick={adicionar} disabled={salvando}>
            {salvando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Adicionar
          </Button>
        </CardContent>
      </Card>

      {carregando && <Skeleton className="h-32 w-full" />}

      <div className="grid gap-3 md:grid-cols-2">
        {exemplos.map((e) => (
          <Card key={e.id}>
            <CardHeader className="pb-2">
              <Estrelas nota={e.estrelas} />
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{e.texto}</p>
              <Button variant="ghost" size="sm" onClick={() => excluir(e.id)}>
                <Trash2 className="size-4 text-destructive" /> Excluir
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
