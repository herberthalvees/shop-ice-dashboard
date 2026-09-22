import { createLazyFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Zap,
} from "lucide-react";
import {
  enviarMensagemShopee,
  listarConversasShopee,
  listarMensagensShopee,
} from "@/lib/chat.functions";
import { useLojaAtual } from "@/lib/loja-store";

export const Route = createLazyFileRoute("/_authenticated/chat")({
  component: ChatPage,
});

type Resposta = {
  id: string;
  titulo: string;
  corpo: string;
  ordem: number;
  ativo: boolean;
};

function horaCurta(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const ROTULOS_TIPO: Record<string, string> = {
  item: "Produto mencionado",
  order: "Pedido mencionado",
  image: "Imagem enviada",
  image_with_text: "Imagem enviada",
  video: "Vídeo enviado",
  sticker: "Sticker enviado",
  voucher: "Cupom enviado",
  faq: "Mensagem automática",
};

function linkConversaShopee(conversationId?: string | null) {
  return conversationId
    ? `https://seller.shopee.com.br/webchat/conversations/${conversationId}`
    : "https://seller.shopee.com.br/webchat/conversations";
}

function deepLinksApp(conversationId?: string | null) {
  const id = conversationId ?? "";
  return [
    id ? `shopee://seller/chat?conversationId=${id}` : "shopee://seller/chat",
    id ? `shopeeseller://chat?conversationId=${id}` : "shopeeseller://chat",
  ];
}

/** Tenta abrir o app da Shopee; se nada abrir em ~1,2s, cai para o link web. */
function abrirConversaShopee(conversationId?: string | null) {
  const web = linkConversaShopee(conversationId);
  if (typeof window === "undefined") return;
  const ehMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!ehMobile) {
    window.open(web, "_blank", "noopener,noreferrer");
    return;
  }

  let saiu = false;
  const marcarSaida = () => {
    if (document.hidden) saiu = true;
  };
  document.addEventListener("visibilitychange", marcarSaida);

  const [primeiro, segundo] = deepLinksApp(conversationId);
  window.location.href = primeiro;
  const tentaSegundo = window.setTimeout(() => {
    if (!saiu) window.location.href = segundo;
  }, 500);

  window.setTimeout(() => {
    window.clearTimeout(tentaSegundo);
    document.removeEventListener("visibilitychange", marcarSaida);
    if (!saiu) window.open(web, "_blank", "noopener,noreferrer");
  }, 1400);
}

function rotuloAnexo(tipo: string, texto: string) {
  if (ROTULOS_TIPO[tipo]) return ROTULOS_TIPO[tipo];
  const limpo = texto.replace(/^\[|\]$/g, "").trim();
  return limpo ? `Anexo: ${limpo}` : "Anexo";
}

type Loja = { id: number; nome: string };

function ChatPage() {
  const qc = useQueryClient();
  const conversasFn = useServerFn(listarConversasShopee);
  const mensagensFn = useServerFn(listarMensagensShopee);
  const enviarFn = useServerFn(enviarMensagemShopee);

  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [soPendentes, setSoPendentes] = useState(false);
  const fimRef = useRef<HTMLDivElement | null>(null);
  const { lojaId, setLojaId } = useLojaAtual();

  const lojas = useQuery<Loja[]>({
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
  });

  // Sem loja escolhida (ou loja escolhida foi desativada): cai pra primeira ativa.
  useEffect(() => {
    if (!lojas.data || lojas.data.length === 0) return;
    if (lojaId != null && lojas.data.some((l) => l.id === lojaId)) return;
    setLojaId(lojas.data[0]!.id);
  }, [lojas.data, lojaId, setLojaId]);

  const trocarLoja = (id: number) => {
    setLojaId(id);
    setSelecionada(null);
  };

  const conversas = useQuery({
    queryKey: ["chat-conversas", lojaId],
    enabled: lojaId != null,
    queryFn: () => conversasFn({ data: { lojaId: lojaId! } }),
    refetchInterval: 60_000,
  });

  const todas = conversas.data && "conversas" in conversas.data ? conversas.data.conversas : [];
  const pendentes = todas.filter((c) => c.pendente).length;
  const lista = useMemo(() => {
    const base = soPendentes ? todas.filter((c) => c.pendente) : todas;
    // Conversas sem resposta primeiro, mantendo a ordem por recência.
    return [...base].sort((a, b) => Number(b.pendente) - Number(a.pendente));
  }, [todas, soPendentes]);
  const erroConversas = conversas.data && !conversas.data.ok ? (conversas.data as any).error : null;
  const atual = useMemo(
    () => todas.find((c) => c.conversation_id === selecionada) ?? null,
    [todas, selecionada],
  );

  const mensagens = useQuery({
    queryKey: ["chat-mensagens", selecionada, atual?.to_id ?? null, lojaId],
    enabled: !!selecionada && lojaId != null,
    queryFn: () =>
      mensagensFn({
        data: { conversationId: selecionada!, buyerId: atual?.to_id, lojaId: lojaId! },
      }),
    refetchInterval: 30_000,
  });

  const itensMensagens =
    mensagens.data && "mensagens" in mensagens.data ? mensagens.data.mensagens : [];

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [itensMensagens.length, selecionada]);

  const respostas = useQuery({
    queryKey: ["chat-respostas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_respostas_rapidas")
        .select("*")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Resposta[];
    },
  });

  const enviar = useMutation({
    mutationFn: async () => {
      if (!atual) throw new Error("Selecione uma conversa");
      const r = await enviarFn({
        data: {
          toId: atual.to_id,
          texto,
          conversationId: atual.conversation_id,
          comprador: atual.to_name,
          lojaId: lojaId ?? undefined,
        },
      });
      if (!r.ok) throw new Error((r as any).error ?? "falha ao enviar");
      return r;
    },
    onSuccess: () => {
      setTexto("");
      toast.success("Mensagem enviada");
      qc.invalidateQueries({ queryKey: ["chat-mensagens", selecionada] });
      qc.invalidateQueries({ queryKey: ["chat-conversas", lojaId] });
    },
    onError: (e: Error) => toast.error("Não foi possível enviar", { description: e.message }),
  });

  const ativos = (respostas.data ?? []).filter((r) => r.ativo);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Chat Shopee</h1>
          <p className="text-sm text-muted-foreground">
            Responda compradores usando textos prontos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lojas.data && lojas.data.length > 1 && (
            <Select
              value={lojaId != null ? String(lojaId) : undefined}
              onValueChange={(v) => trocarLoja(Number(v))}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Loja" />
              </SelectTrigger>
              <SelectContent>
                {lojas.data.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["chat-conversas", lojaId] });
              if (selecionada) qc.invalidateQueries({ queryKey: ["chat-mensagens", selecionada] });
            }}
          >
            <RefreshCw className="size-4" /> Atualizar
          </Button>
        </div>
      </header>

      <Tabs defaultValue="conversas">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="conversas">Conversas</TabsTrigger>
          <TabsTrigger value="textos">Textos prontos</TabsTrigger>
        </TabsList>

        <TabsContent value="conversas" className="mt-4">
          {erroConversas && (
            <Card className="mb-4 border-destructive/40">
              <CardContent className="py-4 text-sm text-destructive">
                Não foi possível carregar as conversas: {erroConversas}
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <Card className={selecionada ? "hidden lg:block" : ""}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Conversas</CardTitle>
                <CardDescription>
                  {pendentes > 0 ? `${pendentes} sem resposta` : "Todas as conversas respondidas"}
                </CardDescription>
                <Button
                  variant={soPendentes ? "default" : "outline"}
                  size="sm"
                  className="mt-2 w-fit"
                  onClick={() => setSoPendentes((v) => !v)}
                >
                  {soPendentes ? "Mostrar todas" : "Só sem resposta"}
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[300px] lg:h-[520px]">
                  <div className="flex flex-col">
                    {conversas.isLoading &&
                      Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="border-b border-border/50 p-3">
                          <Skeleton className="mb-2 h-4 w-28" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      ))}
                    {!conversas.isLoading && lista.length === 0 && (
                      <p className="p-4 text-sm text-muted-foreground">
                        Nenhuma conversa encontrada.
                      </p>
                    )}
                    {lista.map((c) => (
                      <button
                        key={c.conversation_id}
                        type="button"
                        onClick={() => setSelecionada(c.conversation_id)}
                        className={
                          "border-b border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 " +
                          (c.conversation_id === selecionada ? "bg-primary/10" : "")
                        }
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {c.pendente && (
                              <span
                                aria-label="Sem resposta"
                                className="size-2 shrink-0 rounded-full bg-primary"
                              />
                            )}
                            <span
                              className={
                                "truncate text-sm " +
                                (c.pendente ? "font-semibold" : "font-medium text-muted-foreground")
                              }
                            >
                              {c.to_name}
                            </span>
                          </span>
                          {c.pendente ? (
                            <Badge className="shrink-0">
                              {c.nao_lidas > 0 ? c.nao_lidas : "Responder"}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.pendente ? "" : "Você: "}
                          {c.ultima_mensagem}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                          {horaCurta(c.ultima_em)}
                        </p>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card className={selecionada ? "" : "hidden lg:block"}>
              <CardHeader className="flex-row items-center gap-2 pb-3">
                {selecionada && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    onClick={() => setSelecionada(null)}
                    aria-label="Voltar"
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                )}
                <div className="min-w-0">
                  <CardTitle className="truncate text-base">
                    {atual?.to_name ?? "Selecione uma conversa"}
                  </CardTitle>
                  <CardDescription>
                    {atual ? "Histórico recente" : "Escolha um comprador na lista"}
                  </CardDescription>
                </div>
                {atual && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto shrink-0"
                    onClick={() => abrirConversaShopee(atual.conversation_id)}
                  >
                    <ExternalLink className="size-4" /> Abrir na Shopee
                  </Button>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <ScrollArea className="h-[320px] rounded-lg border border-border/60 bg-background/40 p-3 lg:h-[380px]">
                  {!selecionada && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                      <MessageSquare className="size-6" />
                      <p className="text-sm">Nenhuma conversa selecionada</p>
                    </div>
                  )}
                  {selecionada && mensagens.isLoading && (
                    <div className="space-y-3">
                      <Skeleton className="h-12 w-2/3" />
                      <Skeleton className="ml-auto h-12 w-2/3" />
                      <Skeleton className="h-12 w-1/2" />
                    </div>
                  )}
                  {selecionada && !mensagens.isLoading && (
                    <div className="flex flex-col gap-2">
                      {itensMensagens.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Sem mensagens nesta conversa.
                        </p>
                      )}
                      {itensMensagens.map((m) => (
                        <div
                          key={m.id}
                          className={
                            "flex w-full flex-col " + (m.de_loja ? "items-end" : "items-start")
                          }
                        >
                          <span className="mb-0.5 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {m.de_loja ? "Você" : (atual?.to_name ?? "Comprador")}
                          </span>
                          <div
                            className={
                              "max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap break-words " +
                              (m.de_loja
                                ? "rounded-2xl rounded-br-sm bg-primary text-primary-foreground"
                                : "rounded-2xl rounded-bl-sm border border-border bg-muted text-foreground")
                            }
                          >
                            {m.tipo && m.tipo !== "text" ? (
                              <button
                                type="button"
                                onClick={() => abrirConversaShopee(selecionada)}
                                className="inline-flex items-center gap-1.5 text-left underline underline-offset-2"
                              >
                                <ExternalLink className="size-3.5 shrink-0" />
                                {rotuloAnexo(m.tipo, m.texto)} — ver na Shopee
                              </button>
                            ) : (
                              m.texto
                            )}
                            <span
                              className={
                                "mt-1 block text-[10px] " +
                                (m.de_loja ? "text-primary-foreground/70" : "text-muted-foreground")
                              }
                            >
                              {horaCurta(m.em)}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div ref={fimRef} />
                    </div>
                  )}
                </ScrollArea>

                <div className="flex flex-wrap gap-1.5">
                  {ativos.map((r) => (
                    <Button
                      key={r.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setTexto(r.corpo)}
                    >
                      <Zap className="size-3" /> {r.titulo}
                    </Button>
                  ))}
                </div>

                <Textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Escreva a resposta ou escolha um texto pronto…"
                  rows={5}
                  className="resize-y"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{texto.length}/2000</span>
                  <Button
                    onClick={() => enviar.mutate()}
                    disabled={!atual || texto.trim().length === 0 || enviar.isPending}
                  >
                    {enviar.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Enviar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="textos" className="mt-4">
          <TextosProntos respostas={respostas.data ?? []} carregando={respostas.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TextosProntos({ respostas, carregando }: { respostas: Resposta[]; carregando: boolean }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Resposta | null>(null);
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [salvando, setSalvando] = useState(false);

  function abrirNovo() {
    setEditando(null);
    setTitulo("");
    setCorpo("");
    setAberto(true);
  }
  function abrirEdicao(r: Resposta) {
    setEditando(r);
    setTitulo(r.titulo);
    setCorpo(r.corpo);
    setAberto(true);
  }

  async function salvar() {
    if (!titulo.trim() || !corpo.trim()) {
      toast.error("Preencha título e mensagem");
      return;
    }
    setSalvando(true);
    const payload = { titulo: titulo.trim(), corpo: corpo.trim() };
    const { error } = editando
      ? await supabase.from("chat_respostas_rapidas").update(payload).eq("id", editando.id)
      : await supabase.from("chat_respostas_rapidas").insert({
          ...payload,
          ordem: (respostas.at(-1)?.ordem ?? 0) + 1,
        });
    setSalvando(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    toast.success(editando ? "Texto atualizado" : "Texto criado");
    setAberto(false);
    qc.invalidateQueries({ queryKey: ["chat-respostas"] });
  }

  async function excluir(r: Resposta) {
    const { error } = await supabase.from("chat_respostas_rapidas").delete().eq("id", r.id);
    if (error) toast.error("Erro ao excluir", { description: error.message });
    else {
      toast.success("Texto excluído");
      qc.invalidateQueries({ queryKey: ["chat-respostas"] });
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Clique em um texto na aba Conversas para preencher a resposta automaticamente.
        </p>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="size-4" /> Novo texto
        </Button>
      </div>

      {carregando && (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {respostas.map((r) => (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm uppercase tracking-wide text-primary">
                {r.titulo}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.corpo}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(r.corpo);
                      toast.success("Texto copiado");
                    } catch {
                      toast.error("Não foi possível copiar");
                    }
                  }}
                >
                  <Copy className="size-4" /> Copiar
                </Button>
                <Button variant="outline" size="sm" onClick={() => abrirEdicao(r)}>
                  <Pencil className="size-4" /> Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => excluir(r)}>
                  <Trash2 className="size-4 text-destructive" /> Excluir
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar texto" : "Novo texto"}</DialogTitle>
            <DialogDescription>Mensagens prontas para responder compradores.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="titulo-texto">Título</Label>
              <Input
                id="titulo-texto"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: Endereço incorreto"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="corpo-texto">Mensagem</Label>
              <Textarea
                id="corpo-texto"
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
                rows={8}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="size-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
