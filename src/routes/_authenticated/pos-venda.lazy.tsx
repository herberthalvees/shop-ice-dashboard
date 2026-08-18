import { createLazyFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  Lock,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Star,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import {
  enviarTestePosVenda,
  enviarIndividualPosVenda,
  listarContatosPosVenda,
  materializarPublicoPosVenda,
  previewPublicoPosVenda,
  processarFilaPosVenda,
  resultadoCampanhaPosVenda,
  sincronizarContatosPosVenda,
  statusEnvioIndividual,
  sugerirVariacoesPosVenda,
  type ContatoDetalhe,
  type FiltrosPublico,
  type PreviewPublico,
  type ResultadoCampanha,
} from "@/lib/pos-venda.functions";

export const Route = createLazyFileRoute("/_authenticated/pos-venda")({
  component: PosVendaPage,
});

type Cupom = {
  id: string;
  codigo: string;
  desconto: string | null;
  validade: string | null;
  pedido_minimo: number | null;
  observacao: string | null;
  ativo: boolean;
};

type Campanha = {
  id: string;
  nome: string;
  status: string;
  filtros: FiltrosPublico;
  cupom_id: string | null;
  variacoes: string[];
  ritmo: number;
  limite_diario: number;
  janela_dias: number;
  agendada_para: string | null;
  created_at: string;
};

const moeda = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

const dataCurta = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      }).format(new Date(iso))
    : "—";

const statusTom: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  ativa: "bg-primary/15 text-primary",
  pausada: "bg-yellow-500/15 text-yellow-500",
  concluida: "bg-emerald-500/15 text-emerald-500",
  cancelada: "bg-destructive/15 text-destructive",
};

const filtrosVazios: FiltrosPublico = {
  data_de: null,
  data_ate: null,
  pedidos_min: null,
  pedidos_max: null,
  gasto_min: null,
  ticket_min: null,
  ticket_max: null,
  inativo_dias: null,
  avaliacao: null,
  sku: null,
};

function num(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
}

function PosVendaPage() {
  const qc = useQueryClient();
  const previewFn = useServerFn(previewPublicoPosVenda);
  const materializarFn = useServerFn(materializarPublicoPosVenda);
  const resultadoFn = useServerFn(resultadoCampanhaPosVenda);
  const sincronizarFn = useServerFn(sincronizarContatosPosVenda);
  const processarFn = useServerFn(processarFilaPosVenda);
  const testeFn = useServerFn(enviarTestePosVenda);
  const iaFn = useServerFn(sugerirVariacoesPosVenda);

  const [editor, setEditor] = useState<Campanha | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const campanhas = useQuery({
    queryKey: ["pv-campanhas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pv_campanhas")
        .select(
          "id, nome, status, filtros, cupom_id, variacoes, ritmo, limite_diario, janela_dias, agendada_para, created_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campanha[];
    },
  });

  const cupons = useQuery({
    queryKey: ["pv-cupons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pv_cupons")
        .select("id, codigo, desconto, validade, pedido_minimo, observacao, ativo")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Cupom[];
    },
  });

  const contatos = useQuery({
    queryKey: ["pv-contatos-total"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("pv_contatos")
        .select("to_id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  async function novaCampanha() {
    const { data, error } = await supabase
      .from("pv_campanhas")
      .insert({ nome: "Nova campanha", filtros: {}, variacoes: [] })
      .select("*")
      .single();
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["pv-campanhas"] });
    setEditor(data as Campanha);
  }

  async function mudarStatus(c: Campanha, status: string) {
    setOcupado(c.id);
    try {
      if (status === "ativa") {
        if ((c.variacoes ?? []).length === 0) {
          toast.error("Cadastre ao menos um texto de mensagem antes de ativar");
          return;
        }
        const r = await materializarFn({ data: { campanhaId: c.id } });
        if (r.pendentes === 0) {
          toast.error("Nenhum cliente alcançável no público desta campanha");
          return;
        }
        toast.success(`Fila gerada: ${r.pendentes} mensagens pendentes`);
      }
      const { error } = await supabase
        .from("pv_campanhas")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", c.id);
      if (error) throw new Error(error.message);
      await qc.invalidateQueries({ queryKey: ["pv-campanhas"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function excluirCampanha(id: string) {
    const { error } = await supabase.from("pv_campanhas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Campanha excluída");
    await qc.invalidateQueries({ queryKey: ["pv-campanhas"] });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pós-venda</h1>
          <p className="text-sm text-muted-foreground">
            Campanhas de mensagem com cupom para quem já comprou, enviadas pelo chat da Shopee.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={ocupado === "contatos"}
            onClick={async () => {
              setOcupado("contatos");
              try {
                const r = await sincronizarFn({});
                if (!r.ok) throw new Error(r.error);
                toast.success(`${r.gravados} contatos atualizados`);
                await qc.invalidateQueries({ queryKey: ["pv-contatos-total"] });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
              } finally {
                setOcupado(null);
              }
            }}
          >
            {ocupado === "contatos" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Atualizar contatos
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={ocupado === "fila"}
            onClick={async () => {
              setOcupado("fila");
              try {
                const r = await processarFn({});
                if (!r.ok) throw new Error(r.error);
                const enviados = (r.campanhas ?? []).reduce((s, c) => s + c.enviados, 0);
                toast.success(`Rodada concluída: ${enviados} mensagens enviadas`);
                await qc.invalidateQueries({ queryKey: ["pv-campanhas"] });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
              } finally {
                setOcupado(null);
              }
            }}
          >
            {ocupado === "fila" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Enviar agora
          </Button>
          <Button size="sm" onClick={novaCampanha}>
            <Plus className="size-4" />
            Nova campanha
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4 text-sm">
          <Users className="size-4 text-primary" />
          <span className="font-medium">{contatos.data ?? 0}</span>
          <span className="text-muted-foreground">
            contatos alcançáveis pelo chat (só quem já tem conversa aberta pode receber mensagem).
          </span>
        </CardContent>
      </Card>

      <Tabs defaultValue="campanhas">
        <TabsList>
          <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
          <TabsTrigger value="contatos">Contatos</TabsTrigger>
          <TabsTrigger value="cupons">Cupons</TabsTrigger>
          <TabsTrigger value="optout">Opt-out</TabsTrigger>
        </TabsList>

        <TabsContent value="campanhas" className="space-y-3 pt-4">
          {campanhas.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : (campanhas.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Nenhuma campanha ainda. Crie a primeira em “Nova campanha”.
              </CardContent>
            </Card>
          ) : (
            (campanhas.data ?? []).map((c) => (
              <CampanhaCard
                key={c.id}
                campanha={c}
                cupom={(cupons.data ?? []).find((x) => x.id === c.cupom_id) ?? null}
                ocupado={ocupado === c.id}
                onEditar={() => setEditor(c)}
                onStatus={(s) => mudarStatus(c, s)}
                onExcluir={() => excluirCampanha(c.id)}
                resultadoFn={resultadoFn}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="cupons" className="pt-4">
          <Cupons cupons={cupons.data ?? []} carregando={cupons.isLoading} />
        </TabsContent>

        <TabsContent value="contatos" className="pt-4">
          <Contatos />
        </TabsContent>

        <TabsContent value="optout" className="pt-4">
          <OptOut />
        </TabsContent>
      </Tabs>

      {editor && (
        <EditorCampanha
          campanha={editor}
          cupons={cupons.data ?? []}
          onFechar={() => setEditor(null)}
          previewFn={previewFn}
          testeFn={testeFn}
          iaFn={iaFn}
        />
      )}
    </div>
  );
}

function CampanhaCard({
  campanha,
  cupom,
  ocupado,
  onEditar,
  onStatus,
  onExcluir,
  resultadoFn,
}: {
  campanha: Campanha;
  cupom: Cupom | null;
  ocupado: boolean;
  onEditar: () => void;
  onStatus: (s: string) => void;
  onExcluir: () => void;
  resultadoFn: (args: { data: { campanhaId: string } }) => Promise<ResultadoCampanha>;
}) {
  const resultado = useQuery({
    queryKey: ["pv-resultado", campanha.id, campanha.status],
    queryFn: () => resultadoFn({ data: { campanhaId: campanha.id } }),
  });

  const r = resultado.data;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{campanha.nome}</CardTitle>
            <CardDescription>
              Criada em {dataCurta(campanha.created_at)} · ritmo {campanha.ritmo}/rodada · limite{" "}
              {campanha.limite_diario}/dia
              {cupom ? ` · cupom ${cupom.codigo}` : ""}
            </CardDescription>
          </div>
          <Badge className={statusTom[campanha.status] ?? ""}>{campanha.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Metrica titulo="Na fila" valor={r ? String(r.pendentes) : "—"} />
          <Metrica titulo="Enviados" valor={r ? String(r.enviados) : "—"} />
          <Metrica titulo="Erros" valor={r ? String(r.erros) : "—"} tom={r?.erros ? "danger" : undefined} />
          <Metrica titulo="Pedidos depois" valor={r ? String(r.pedidos_pos) : "—"} />
          <Metrica titulo="Receita depois" valor={r ? moeda(r.receita_pos) : "—"} tom="ok" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEditar}>
            Editar
          </Button>
          {campanha.status !== "ativa" && campanha.status !== "concluida" && (
            <Button size="sm" disabled={ocupado} onClick={() => onStatus("ativa")}>
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Ativar
            </Button>
          )}
          {campanha.status === "ativa" && (
            <Button size="sm" variant="outline" onClick={() => onStatus("pausada")}>
              <Pause className="size-4" />
              Pausar
            </Button>
          )}
          {campanha.status !== "cancelada" && campanha.status !== "concluida" && (
            <Button size="sm" variant="outline" onClick={() => onStatus("cancelada")}>
              <Ban className="size-4" />
              Cancelar
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onExcluir}>
            <Trash2 className="size-4" />
            Excluir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Metrica({
  titulo,
  valor,
  tom,
}: {
  titulo: string;
  valor: string;
  tom?: "ok" | "danger";
}) {
  const cor = tom === "ok" ? "text-emerald-500" : tom === "danger" ? "text-destructive" : "";
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className={`text-lg font-semibold ${cor}`}>{valor}</p>
    </div>
  );
}

function EditorCampanha({
  campanha,
  cupons,
  onFechar,
  previewFn,
  testeFn,
  iaFn,
}: {
  campanha: Campanha;
  cupons: Cupom[];
  onFechar: () => void;
  previewFn: (args: { data: { filtros: FiltrosPublico } }) => Promise<PreviewPublico>;
  testeFn: (args: { data: { toId: string; texto: string } }) => Promise<{ ok: boolean; error?: string }>;
  iaFn: (args: { data: { briefing: string } }) => Promise<
    { ok: true; variacoes: string[] } | { ok: false; error: string }
  >;
}) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(campanha.nome);
  const [filtros, setFiltros] = useState<FiltrosPublico>({ ...filtrosVazios, ...campanha.filtros });
  const [cupomId, setCupomId] = useState(campanha.cupom_id ?? "nenhum");
  const [variacoes, setVariacoes] = useState((campanha.variacoes ?? []).join("\n---\n"));
  const [ritmo, setRitmo] = useState(String(campanha.ritmo));
  const [limite, setLimite] = useState(String(campanha.limite_diario));
  const [janela, setJanela] = useState(String(campanha.janela_dias));
  const [briefing, setBriefing] = useState("");
  const [preview, setPreview] = useState<{ total: number; alcancaveis: number } | null>(null);
  const [acao, setAcao] = useState<string | null>(null);
  const [testeId, setTesteId] = useState("");

  const listaVariacoes = useMemo(
    () =>
      variacoes
        .split("\n---\n")
        .map((t) => t.trim())
        .filter(Boolean),
    [variacoes],
  );

  async function calcularPublico() {
    setAcao("preview");
    try {
      const r = await previewFn({ data: { filtros: { ...filtros, janela_dias: num(janela) } } });
      setPreview({ total: Number(r.total), alcancaveis: Number(r.alcancaveis) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAcao(null);
    }
  }

  async function salvar() {
    setAcao("salvar");
    try {
      const { error } = await supabase
        .from("pv_campanhas")
        .update({
          nome: nome.trim() || "Campanha sem nome",
          filtros,
          cupom_id: cupomId === "nenhum" ? null : cupomId,
          variacoes: listaVariacoes,
          ritmo: Math.max(1, Math.min(200, Number(ritmo) || 20)),
          limite_diario: Math.max(1, Math.min(5000, Number(limite) || 200)),
          janela_dias: Math.max(0, Math.min(365, Number(janela) || 30)),
          updated_at: new Date().toISOString(),
        })
        .eq("id", campanha.id);
      if (error) throw new Error(error.message);
      toast.success("Campanha salva");
      await qc.invalidateQueries({ queryKey: ["pv-campanhas"] });
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAcao(null);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar campanha</DialogTitle>
          <DialogDescription>
            Escolha o público, o cupom e os textos. Nada é enviado antes de você ativar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>

          <section className="space-y-3 rounded-lg border border-border/60 p-3">
            <p className="text-sm font-medium">Público</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Compraram de">
                <Input
                  type="date"
                  value={filtros.data_de ?? ""}
                  onChange={(e) => setFiltros({ ...filtros, data_de: e.target.value || null })}
                />
              </Campo>
              <Campo label="Compraram até">
                <Input
                  type="date"
                  value={filtros.data_ate ?? ""}
                  onChange={(e) => setFiltros({ ...filtros, data_ate: e.target.value || null })}
                />
              </Campo>
              <Campo label="Mínimo de pedidos">
                <Input
                  type="number"
                  min={1}
                  value={filtros.pedidos_min ?? ""}
                  onChange={(e) => setFiltros({ ...filtros, pedidos_min: num(e.target.value) })}
                />
              </Campo>
              <Campo label="Máximo de pedidos">
                <Input
                  type="number"
                  min={1}
                  value={filtros.pedidos_max ?? ""}
                  onChange={(e) => setFiltros({ ...filtros, pedidos_max: num(e.target.value) })}
                />
              </Campo>
              <Campo label="Gasto total mínimo (R$)">
                <Input
                  type="number"
                  value={filtros.gasto_min ?? ""}
                  onChange={(e) => setFiltros({ ...filtros, gasto_min: num(e.target.value) })}
                />
              </Campo>
              <Campo label="Ticket do último pedido (mín.)">
                <Input
                  type="number"
                  value={filtros.ticket_min ?? ""}
                  onChange={(e) => setFiltros({ ...filtros, ticket_min: num(e.target.value) })}
                />
              </Campo>
              <Campo label="Sem comprar há (dias)">
                <Input
                  type="number"
                  value={filtros.inativo_dias ?? ""}
                  onChange={(e) => setFiltros({ ...filtros, inativo_dias: num(e.target.value) })}
                />
              </Campo>
              <Campo label="Produto ou SKU comprado">
                <Input
                  value={filtros.sku ?? ""}
                  placeholder="ex.: gelo, DI-001"
                  onChange={(e) => setFiltros({ ...filtros, sku: e.target.value || null })}
                />
              </Campo>
              <Campo label="Avaliação">
                <Select
                  value={filtros.avaliacao ?? "qualquer"}
                  onValueChange={(v) =>
                    setFiltros({
                      ...filtros,
                      avaliacao: v === "qualquer" ? null : (v as FiltrosPublico["avaliacao"]),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualquer">Qualquer</SelectItem>
                    <SelectItem value="positiva">Avaliou 4–5 estrelas</SelectItem>
                    <SelectItem value="negativa">Avaliou 3 estrelas ou menos</SelectItem>
                    <SelectItem value="sem">Nunca avaliou</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>
              <Campo label="Não repetir mensagem por (dias)">
                <Input type="number" value={janela} onChange={(e) => setJanela(e.target.value)} />
              </Campo>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="outline" disabled={acao === "preview"} onClick={calcularPublico}>
                {acao === "preview" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Users className="size-4" />
                )}
                Calcular público
              </Button>
              {preview && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{preview.total}</span> clientes no
                  filtro ·{" "}
                  <span className="font-medium text-primary">{preview.alcancaveis}</span> alcançáveis
                  por chat
                </p>
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-border/60 p-3">
            <p className="text-sm font-medium">Cupom</p>
            <Select value={cupomId} onValueChange={setCupomId}>
              <SelectTrigger>
                <SelectValue placeholder="Sem cupom" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Sem cupom</SelectItem>
                {cupons
                  .filter((c) => c.ativo)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.codigo} {c.desconto ? `· ${c.desconto}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </section>

          <section className="space-y-3 rounded-lg border border-border/60 p-3">
            <p className="text-sm font-medium">Mensagens</p>
            <p className="text-xs text-muted-foreground">
              Separe as variações com uma linha contendo <code>---</code>. Variáveis:{" "}
              <code>{"{comprador}"}</code> <code>{"{produto}"}</code> <code>{"{cupom}"}</code>{" "}
              <code>{"{desconto}"}</code> <code>{"{validade}"}</code>
            </p>
            <Textarea
              rows={8}
              value={variacoes}
              onChange={(e) => setVariacoes(e.target.value)}
              placeholder={"Oi! Obrigado pela compra 😊 Use o cupom {cupom} até {validade}.\n---\nQue bom te ver por aqui! Separei o cupom {cupom} para o seu próximo pedido."}
            />
            <p className="text-xs text-muted-foreground">
              {listaVariacoes.length} variação(ões) — sorteadas por cliente.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={briefing}
                onChange={(e) => setBriefing(e.target.value)}
                placeholder="Descreva a mensagem para a IA sugerir 3 variações"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={acao === "ia"}
                onClick={async () => {
                  setAcao("ia");
                  try {
                    const r = await iaFn({ data: { briefing } });
                    if (!r.ok) throw new Error(r.error);
                    setVariacoes((v) => [v.trim(), ...r.variacoes].filter(Boolean).join("\n---\n"));
                    toast.success("Sugestões adicionadas");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : String(e));
                  } finally {
                    setAcao(null);
                  }
                }}
              >
                {acao === "ia" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Sugerir com IA
              </Button>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border border-border/60 p-3">
            <p className="text-sm font-medium">Ritmo de envio</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Mensagens por rodada (a cada 5 min)">
                <Input type="number" value={ritmo} onChange={(e) => setRitmo(e.target.value)} />
              </Campo>
              <Campo label="Limite por dia">
                <Input type="number" value={limite} onChange={(e) => setLimite(e.target.value)} />
              </Campo>
            </div>
          </section>

          <section className="space-y-2 rounded-lg border border-border/60 p-3">
            <p className="text-sm font-medium">Teste</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={testeId}
                onChange={(e) => setTesteId(e.target.value)}
                placeholder="ID do contato (to_id)"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={acao === "teste"}
                onClick={async () => {
                  const modelo = listaVariacoes[0];
                  if (!modelo) return toast.error("Escreva ao menos uma mensagem");
                  setAcao("teste");
                  try {
                    const r = await testeFn({ data: { toId: testeId.trim(), texto: modelo } });
                    if (!r.ok) throw new Error(r.error ?? "falha no envio");
                    toast.success("Mensagem de teste enviada");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : String(e));
                  } finally {
                    setAcao(null);
                  }
                }}
              >
                {acao === "teste" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Enviar teste
              </Button>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <Button disabled={acao === "salvar"} onClick={salvar}>
            {acao === "salvar" && <Loader2 className="size-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Cupons({ cupons, carregando }: { cupons: Cupom[]; carregando: boolean }) {
  const qc = useQueryClient();
  const [codigo, setCodigo] = useState("");
  const [desconto, setDesconto] = useState("");
  const [validade, setValidade] = useState("");
  const [minimo, setMinimo] = useState("");

  async function criar() {
    if (!codigo.trim()) return toast.error("Informe o código do cupom");
    const { error } = await supabase.from("pv_cupons").insert({
      codigo: codigo.trim().toUpperCase(),
      desconto: desconto.trim() || null,
      validade: validade || null,
      pedido_minimo: num(minimo),
    });
    if (error) return toast.error(error.message);
    setCodigo("");
    setDesconto("");
    setValidade("");
    setMinimo("");
    toast.success("Cupom cadastrado");
    await qc.invalidateQueries({ queryKey: ["pv-cupons"] });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Novo cupom</CardTitle>
          <CardDescription>
            O cupom é criado no Seller Center da Shopee; aqui você registra o código para usar nas
            mensagens.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <Campo label="Código">
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="DREAM10" />
          </Campo>
          <Campo label="Desconto">
            <Input value={desconto} onChange={(e) => setDesconto(e.target.value)} placeholder="10%" />
          </Campo>
          <Campo label="Validade">
            <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
          </Campo>
          <Campo label="Pedido mínimo (R$)">
            <Input type="number" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
          </Campo>
          <div className="sm:col-span-4">
            <Button size="sm" onClick={criar}>
              <Plus className="size-4" />
              Cadastrar
            </Button>
          </div>
        </CardContent>
      </Card>

      {carregando ? (
        <Skeleton className="h-24 w-full" />
      ) : cupons.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum cupom cadastrado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {cupons.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-medium">{c.codigo}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.desconto ?? "sem desconto informado"} · validade {dataCurta(c.validade)}
                    {c.pedido_minimo ? ` · mínimo ${moeda(c.pedido_minimo)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!c.ativo && <Badge variant="secondary">inativo</Badge>}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const { error } = await supabase
                        .from("pv_cupons")
                        .update({ ativo: !c.ativo })
                        .eq("id", c.id);
                      if (error) return toast.error(error.message);
                      await qc.invalidateQueries({ queryKey: ["pv-cupons"] });
                    }}
                  >
                    {c.ativo ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={async () => {
                      const { error } = await supabase.from("pv_cupons").delete().eq("id", c.id);
                      if (error) return toast.error(error.message);
                      await qc.invalidateQueries({ queryKey: ["pv-cupons"] });
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function OptOut() {
  const qc = useQueryClient();
  const [usuario, setUsuario] = useState("");
  const [motivo, setMotivo] = useState("");

  const lista = useQuery({
    queryKey: ["pv-optout"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pv_optout")
        .select("comprador_username, motivo, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Array<{
        comprador_username: string;
        motivo: string | null;
        created_at: string;
      }>;
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bloquear cliente</CardTitle>
          <CardDescription>
            Clientes nesta lista nunca entram no público de nenhuma campanha.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Campo label="Usuário do comprador">
            <Input value={usuario} onChange={(e) => setUsuario(e.target.value)} />
          </Campo>
          <Campo label="Motivo (opcional)">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
          <div className="flex items-end">
            <Button
              size="sm"
              onClick={async () => {
                if (!usuario.trim()) return toast.error("Informe o usuário");
                const { error } = await supabase
                  .from("pv_optout")
                  .insert({ comprador_username: usuario.trim(), motivo: motivo.trim() || null });
                if (error) return toast.error(error.message);
                setUsuario("");
                setMotivo("");
                toast.success("Cliente bloqueado");
                await qc.invalidateQueries({ queryKey: ["pv-optout"] });
              }}
            >
              <Ban className="size-4" />
              Bloquear
            </Button>
          </div>
        </CardContent>
      </Card>

      {lista.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (lista.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum cliente bloqueado.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(lista.data ?? []).map((o) => (
            <Card key={o.comprador_username}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{o.comprador_username}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.motivo ?? "sem motivo"} · {dataCurta(o.created_at)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const { error } = await supabase
                      .from("pv_optout")
                      .delete()
                      .eq("comprador_username", o.comprador_username);
                    if (error) return toast.error(error.message);
                    await qc.invalidateQueries({ queryKey: ["pv-optout"] });
                  }}
                >
                  Remover
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
