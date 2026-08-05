import { createLazyFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Boxes,
  ImageOff,
  Link2,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  History,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createLazyFileRoute("/_authenticated/estoque")({
  component: EstoquePage,
});

type Vinculo = {
  id: string;
  marketplace: string;
  item_id: number;
  model_id: number;
  fator: number;
  ativo: boolean;
  produto: string | null;
  variacao: string | null;
  sku: string | null;
  imagem_url: string | null;
};

type ItemEstoque = {
  id: string;
  nome: string;
  descricao: string | null;
  imagem_url: string | null;
  unidade: string;
  saldo: number;
  estoque_minimo: number;
  ativo: boolean;
  vinculos: Vinculo[];
  vendidos_30d: number;
};

type ProdutoRef = {
  item_id: number;
  model_id: number;
  marketplace: string;
  produto: string | null;
  variacao: string | null;
  sku: string | null;
  imagem_url: string | null;
};

const nf = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Tenta adivinhar quantas unidades do estoque saem por venda a partir da variação. */
export function sugerirFator(texto: string | null | undefined): number {
  if (!texto) return 1;
  const t = texto.toLowerCase();
  const pares = t.match(/(\d+)\s*(pares?)/);
  if (pares) return Number(pares[1]) * 2;
  const un = t.match(/(\d+)\s*(un\b|unid|unidades?|pe(c|ç)as?|pcs)/);
  if (un) return Number(un[1]);
  const kit = t.match(/kit\s*(\d+)/);
  if (kit) return Number(kit[1]);
  const primeiro = t.match(/(\d+)/);
  if (primeiro) return Number(primeiro[1]);
  return 1;
}

function Miniatura({ url, alt, className }: { url: string | null; alt: string; className?: string }) {
  if (!url) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground",
          className,
        )}
      >
        <ImageOff className="size-4" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={cn("rounded-md border border-border/60 object-cover", className)}
    />
  );
}

function EstoquePage() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [somenteBaixo, setSomenteBaixo] = useState(false);
  const [editando, setEditando] = useState<ItemEstoque | "novo" | null>(null);
  const [criandoDeProduto, setCriandoDeProduto] = useState(false);
  const [movimentando, setMovimentando] = useState<ItemEstoque | null>(null);
  const [vinculando, setVinculando] = useState<ItemEstoque | null>(null);
  const [historico, setHistorico] = useState<ItemEstoque | null>(null);

  const { data: itens, isLoading } = useQuery({
    queryKey: ["estoque-itens"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("estoque_listar" as any);
      if (error) throw error;
      return ((data as any[]) ?? []).map((r) => ({
        id: String(r.id),
        nome: r.nome ?? "",
        descricao: r.descricao ?? null,
        imagem_url: r.imagem_url ?? null,
        unidade: r.unidade ?? "un",
        saldo: Number(r.saldo ?? 0),
        estoque_minimo: Number(r.estoque_minimo ?? 0),
        ativo: Boolean(r.ativo),
        vendidos_30d: Number(r.vendidos_30d ?? 0),
        vinculos: ((r.vinculos as any[]) ?? []).map((v) => ({
          id: String(v.id),
          marketplace: v.marketplace ?? "shopee",
          item_id: Number(v.item_id ?? 0),
          model_id: Number(v.model_id ?? 0),
          fator: Number(v.fator ?? 1),
          ativo: Boolean(v.ativo),
          produto: v.produto ?? null,
          variacao: v.variacao ?? null,
          sku: v.sku ?? null,
          imagem_url: v.imagem_url ?? null,
        })),
      })) as ItemEstoque[];
    },
  });

  const { data: produtos } = useQuery({
    queryKey: ["estoque-produtos-ref"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos" as any)
        .select("item_id, model_id, marketplace, produto, variacao, sku, imagem_url")
        .order("produto", { ascending: true });
      if (error) throw error;
      return ((data as any[]) ?? []).map((p) => ({
        item_id: Number(p.item_id),
        model_id: Number(p.model_id ?? 0),
        marketplace: p.marketplace ?? "shopee",
        produto: p.produto ?? null,
        variacao: p.variacao ?? null,
        sku: p.sku ?? null,
        imagem_url: p.imagem_url ?? null,
      })) as ProdutoRef[];
    },
  });

  const vinculadosSet = useMemo(() => {
    const s = new Set<string>();
    for (const i of itens ?? []) {
      for (const v of i.vinculos) s.add(`${v.marketplace}:${v.item_id}:${v.model_id}`);
    }
    return s;
  }, [itens]);

  const lista = useMemo(() => {
    let base = itens ?? [];
    const b = busca.trim().toLowerCase();
    if (b) {
      base = base.filter(
        (i) =>
          i.nome.toLowerCase().includes(b) ||
          (i.descricao ?? "").toLowerCase().includes(b) ||
          i.vinculos.some(
            (v) =>
              (v.produto ?? "").toLowerCase().includes(b) ||
              (v.sku ?? "").toLowerCase().includes(b),
          ),
      );
    }
    if (somenteBaixo) base = base.filter((i) => i.saldo <= i.estoque_minimo);
    return base;
  }, [itens, busca, somenteBaixo]);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["estoque-itens"] });

  const totalUnidades = (itens ?? []).reduce((a, i) => a + i.saldo, 0);
  const emAlerta = (itens ?? []).filter((i) => i.saldo <= i.estoque_minimo).length;
  const semVinculo = (itens ?? []).filter((i) => i.vinculos.length === 0).length;

  return (
    <TooltipProvider>
      <div className="space-y-5">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Boxes className="size-6 text-primary" />
            Estoque real
          </h1>
          <p className="text-sm text-muted-foreground">
            Seu estoque físico, único para todos os canais. Cada venda sincronizada abate
            automaticamente a quantidade vinculada.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Itens cadastrados</p>
              <p className="text-xl font-semibold">{(itens ?? []).length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Unidades em estoque</p>
              <p className="text-xl font-semibold">{nf(totalUnidades)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Abaixo do mínimo</p>
              <p className={cn("text-xl font-semibold", emAlerta > 0 && "text-destructive")}>
                {emAlerta}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Sem produto vinculado</p>
              <p className="text-xl font-semibold">{semVinculo}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar item, produto ou SKU"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="baixo" checked={somenteBaixo} onCheckedChange={setSomenteBaixo} />
            <Label htmlFor="baixo" className="text-sm">
              Só estoque baixo
            </Label>
          </div>
          <Button onClick={() => setCriandoDeProduto(true)}>
            <Plus className="size-4" /> Novo item
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : lista.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Boxes className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhum item de estoque ainda. Escolha um produto da aba Produtos e informe apenas a
                quantidade que você tem — a variação, o SKU e a imagem já vêm prontos.
              </p>
              <Button onClick={() => setCriandoDeProduto(true)}>
                <Plus className="size-4" /> Criar a partir de um produto
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {lista.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onEditar={() => setEditando(item)}
                onMovimentar={() => setMovimentando(item)}
                onVincular={() => setVinculando(item)}
                onHistorico={() => setHistorico(item)}
                onMudou={recarregar}
              />
            ))}
          </div>
        )}
      </div>

      <DialogItem
        alvo={editando}
        onClose={() => setEditando(null)}
        onSalvo={() => {
          setEditando(null);
          recarregar();
        }}
      />
      <DialogNovoDeProduto
        aberto={criandoDeProduto}
        produtos={produtos ?? []}
        jaVinculados={vinculadosSet}
        onClose={() => setCriandoDeProduto(false)}
        onSalvo={recarregar}
        onManual={() => {
          setCriandoDeProduto(false);
          setEditando("novo");
        }}
      />
      <DialogMovimento
        item={movimentando}
        onClose={() => setMovimentando(null)}
        onSalvo={() => {
          setMovimentando(null);
          recarregar();
        }}
      />
      <DialogVincular
        item={vinculando}
        produtos={produtos ?? []}
        jaVinculados={vinculadosSet}
        onClose={() => setVinculando(null)}
        onSalvo={recarregar}
      />
      <SheetHistorico item={historico} onClose={() => setHistorico(null)} />
    </TooltipProvider>
  );
}

function ItemCard({
  item,
  onEditar,
  onMovimentar,
  onVincular,
  onHistorico,
  onMudou,
}: {
  item: ItemEstoque;
  onEditar: () => void;
  onMovimentar: () => void;
  onVincular: () => void;
  onHistorico: () => void;
  onMudou: () => void;
}) {
  const baixo = item.saldo <= item.estoque_minimo;

  async function rapido(delta: number) {
    const { error } = await supabase.rpc("estoque_movimentar" as any, {
      p_estoque_item_id: item.id,
      p_quantidade: Math.abs(delta),
      p_tipo: delta > 0 ? "entrada" : "saida",
      p_observacao: "ajuste rápido",
    });
    if (error) return toast.error(error.message);
    onMudou();
  }

  async function removerVinculo(id: string) {
    const { error } = await supabase.from("estoque_vinculos" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Vínculo removido");
    onMudou();
  }

  async function excluirItem() {
    if (!confirm(`Excluir "${item.nome}" e todo o histórico dele?`)) return;
    const { error } = await supabase.from("estoque_itens" as any).delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Item excluído");
    onMudou();
  }

  return (
    <Card className={cn(!item.ativo && "opacity-60")}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Miniatura url={item.imagem_url} alt={item.nome} className="size-16 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{item.nome}</p>
              {baixo && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="size-3" /> estoque baixo
                </Badge>
              )}
              {!item.ativo && <Badge variant="secondary">inativo</Badge>}
            </div>
            {item.descricao && (
              <p className="line-clamp-2 text-xs text-muted-foreground">{item.descricao}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Mínimo {nf(item.estoque_minimo)} {item.unidade} · saíram {nf(item.vendidos_30d)} nos
              últimos 30 dias
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => rapido(-1)} aria-label="Baixar 1">
              <Minus className="size-4" />
            </Button>
            <div className="min-w-20 text-center">
              <p
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  baixo ? "text-destructive" : "text-primary",
                )}
              >
                {nf(item.saldo)}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {item.unidade}
              </p>
            </div>
            <Button variant="outline" size="icon" onClick={() => rapido(1)} aria-label="Somar 1">
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onMovimentar}>
            Movimentar
          </Button>
          <Button variant="outline" size="sm" onClick={onVincular}>
            <Link2 className="size-4" /> Vincular produtos
          </Button>
          <Button variant="ghost" size="sm" onClick={onHistorico}>
            <History className="size-4" /> Histórico
          </Button>
          <Button variant="ghost" size="sm" onClick={onEditar}>
            <Pencil className="size-4" /> Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={excluirItem}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        {item.vinculos.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
            Nenhum produto vinculado — as vendas ainda não abatem deste item.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {item.vinculos.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 p-2"
              >
                <Miniatura
                  url={v.imagem_url}
                  alt={v.produto ?? "produto"}
                  className="size-10 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{v.produto ?? `item ${v.item_id}`}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {v.variacao ?? "—"} {v.sku ? `· ${v.sku}` : ""}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="shrink-0 tabular-nums">
                      ×{nf(v.fator)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Cada unidade vendida abate {nf(v.fator)} {item.unidade}
                  </TooltipContent>
                </Tooltip>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removerVinculo(v.id)}
                  aria-label="Remover vínculo"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DialogItem({
  alvo,
  onClose,
  onSalvo,
}: {
  alvo: ItemEstoque | "novo" | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const novo = alvo === "novo";
  const item = novo ? null : alvo;
  const [form, setForm] = useState({
    nome: "",
    descricao: "",
    imagem_url: "",
    unidade: "un",
    estoque_minimo: "0",
    saldo: "0",
    ativo: true,
  });
  const [chave, setChave] = useState<string | null>(null);
  const chaveAtual = novo ? "novo" : (item?.id ?? null);
  if (alvo && chave !== chaveAtual) {
    setChave(chaveAtual);
    setForm({
      nome: item?.nome ?? "",
      descricao: item?.descricao ?? "",
      imagem_url: item?.imagem_url ?? "",
      unidade: item?.unidade ?? "un",
      estoque_minimo: String(item?.estoque_minimo ?? 0),
      saldo: String(item?.saldo ?? 0),
      ativo: item?.ativo ?? true,
    });
  }

  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!form.nome.trim()) return toast.error("Informe o nome do item");
    setSalvando(true);
    try {
      const base = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        imagem_url: form.imagem_url.trim() || null,
        unidade: form.unidade.trim() || "un",
        estoque_minimo: Number(form.estoque_minimo) || 0,
        ativo: form.ativo,
      };
      if (novo) {
        const { error } = await supabase
          .from("estoque_itens" as any)
          .insert({ ...base, saldo: Number(form.saldo) || 0 });
        if (error) throw error;
        toast.success("Item criado");
      } else if (item) {
        const { error } = await supabase.from("estoque_itens" as any).update(base).eq("id", item.id);
        if (error) throw error;
        const novoSaldo = Number(form.saldo);
        if (!Number.isNaN(novoSaldo) && novoSaldo !== item.saldo) {
          const { error: e2 } = await supabase.rpc("estoque_movimentar" as any, {
            p_estoque_item_id: item.id,
            p_quantidade: novoSaldo,
            p_tipo: "saldo",
            p_observacao: "saldo definido na edição",
          });
          if (e2) throw e2;
        }
        toast.success("Item atualizado");
      }
      onSalvo();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={alvo !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{novo ? "Novo item de estoque" : "Editar item"}</DialogTitle>
          <DialogDescription>
            O item representa o que você realmente tem guardado — depois vincule as variações de
            cada canal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex.: Antena corta pipa cromada"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Textarea
              rows={2}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>URL da imagem (opcional)</Label>
            <Input
              value={form.imagem_url}
              onChange={(e) => setForm({ ...form, imagem_url: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Input
                value={form.unidade}
                onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                placeholder="un"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Saldo</Label>
              <Input
                type="number"
                value={form.saldo}
                onChange={(e) => setForm({ ...form, saldo: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mínimo</Label>
              <Input
                type="number"
                value={form.estoque_minimo}
                onChange={(e) => setForm({ ...form, estoque_minimo: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="ativo"
              checked={form.ativo}
              onCheckedChange={(v) => setForm({ ...form, ativo: v })}
            />
            <Label htmlFor="ativo">Item ativo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogMovimento({
  item,
  onClose,
  onSalvo,
}: {
  item: ItemEstoque | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  return <DialogMovimentoBase item={item} onClose={onClose} onSalvo={onSalvo} />;
}

function DialogNovoDeProduto({
  aberto,
  produtos,
  jaVinculados,
  onClose,
  onSalvo,
  onManual,
}: {
  aberto: boolean;
  produtos: ProdutoRef[];
  jaVinculados: Set<string>;
  onClose: () => void;
  onSalvo: () => void;
  onManual: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [fatores, setFatores] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const base = b
      ? produtos.filter(
          (p) =>
            (p.produto ?? "").toLowerCase().includes(b) ||
            (p.variacao ?? "").toLowerCase().includes(b) ||
            (p.sku ?? "").toLowerCase().includes(b),
        )
      : produtos;
    return base.slice(0, 80);
  }, [produtos, busca]);

  async function criar(p: ProdutoRef) {
    const chave = `${p.marketplace}:${p.item_id}:${p.model_id}`;
    const qtd = Number(qtds[chave] ?? "");
    if (Number.isNaN(qtd)) return toast.error("Informe a quantidade em estoque");
    const fator = Number(fatores[chave] ?? sugerirFator(p.variacao)) || 1;
    setSalvando(chave);
    try {
      const nome = [p.produto ?? `item ${p.item_id}`, p.variacao].filter(Boolean).join(" · ");
      const { data, error } = await supabase
        .from("estoque_itens" as any)
        .insert({
          nome,
          descricao: p.sku ? `SKU ${p.sku}` : null,
          imagem_url: p.imagem_url,
          unidade: "un",
          saldo: 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      const novoId = (data as any).id as string;

      const { error: e2 } = await supabase.from("estoque_vinculos" as any).insert({
        estoque_item_id: novoId,
        marketplace: p.marketplace,
        item_id: p.item_id,
        model_id: p.model_id,
        fator,
      });
      if (e2) throw e2;

      if (qtd !== 0) {
        const { error: e3 } = await supabase.rpc("estoque_movimentar" as any, {
          p_estoque_item_id: novoId,
          p_quantidade: qtd,
          p_tipo: "entrada",
          p_observacao: "saldo inicial",
        });
        if (e3) throw e3;
      }
      toast.success(`“${nome}” criado com ${qtd} un (×${fator} por venda)`);
      setQtds((s) => ({ ...s, [chave]: "" }));
      onSalvo();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar item");
    } finally {
      setSalvando(null);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo item de estoque</DialogTitle>
          <DialogDescription>
            Escolha o produto (com variação e SKU) e informe só a quantidade que você tem. O vínculo
            é criado automaticamente, com o fator sugerido pela variação.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto, variação ou SKU"
            className="pl-9"
          />
        </div>
        <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {filtrados.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum produto encontrado.
            </p>
          )}
          {filtrados.map((p) => {
            const chave = `${p.marketplace}:${p.item_id}:${p.model_id}`;
            const usado = jaVinculados.has(chave);
            return (
              <div
                key={chave}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 p-2"
              >
                <Miniatura
                  url={p.imagem_url}
                  alt={p.produto ?? "produto"}
                  className="size-12 shrink-0"
                />
                <div className="min-w-40 flex-1">
                  <p className="truncate text-sm font-medium">{p.produto ?? `item ${p.item_id}`}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.variacao ?? "—"} {p.sku ? `· ${p.sku}` : ""}
                    {usado && " · já tem item de estoque"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="space-y-0.5">
                    <Label className="text-[10px] uppercase text-muted-foreground">Qtd</Label>
                    <Input
                      type="number"
                      className="w-20"
                      placeholder="0"
                      value={qtds[chave] ?? ""}
                      onChange={(e) => setQtds({ ...qtds, [chave]: e.target.value })}
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px] uppercase text-muted-foreground">Fator</Label>
                    <Input
                      type="number"
                      className="w-16"
                      value={fatores[chave] ?? String(sugerirFator(p.variacao))}
                      onChange={(e) => setFatores({ ...fatores, [chave]: e.target.value })}
                    />
                  </div>
                  <Button
                    size="sm"
                    className="mt-4"
                    disabled={salvando === chave}
                    onClick={() => criar(p)}
                  >
                    Criar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onManual}>
            Criar item manual (agrupar vários produtos)
          </Button>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogMovimentoBase({
  item,
  onClose,
  onSalvo,
}: {
  item: ItemEstoque | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [tipo, setTipo] = useState("entrada");
  const [qtd, setQtd] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!item) return;
    const n = Number(qtd);
    if (Number.isNaN(n)) return toast.error("Informe a quantidade");
    setSalvando(true);
    const { error } = await supabase.rpc("estoque_movimentar" as any, {
      p_estoque_item_id: item.id,
      p_quantidade: n,
      p_tipo: tipo,
      p_observacao: obs.trim() || null,
    });
    setSalvando(false);
    if (error) return toast.error(error.message);
    toast.success("Estoque atualizado");
    setQtd("");
    setObs("");
    onSalvo();
  }

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Movimentar estoque</DialogTitle>
          <DialogDescription>
            {item?.nome} · saldo atual {nf(item?.saldo ?? 0)} {item?.unidade}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">Entrada (compra / reposição)</SelectItem>
                <SelectItem value="saida">Saída (perda, brinde, uso)</SelectItem>
                <SelectItem value="saldo">Definir saldo exato (contagem)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{tipo === "saldo" ? "Saldo contado" : "Quantidade"}</Label>
            <Input type="number" value={qtd} onChange={(e) => setQtd(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <Input value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogVincular({
  item,
  produtos,
  jaVinculados,
  onClose,
  onSalvo,
}: {
  item: ItemEstoque | null;
  produtos: ProdutoRef[];
  jaVinculados: Set<string>;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [fatores, setFatores] = useState<Record<string, string>>({});

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const base = b
      ? produtos.filter(
          (p) =>
            (p.produto ?? "").toLowerCase().includes(b) ||
            (p.variacao ?? "").toLowerCase().includes(b) ||
            (p.sku ?? "").toLowerCase().includes(b),
        )
      : produtos;
    return base.slice(0, 60);
  }, [produtos, busca]);

  async function vincular(p: ProdutoRef) {
    if (!item) return;
    const chave = `${p.marketplace}:${p.item_id}:${p.model_id}`;
    const fator = Number(fatores[chave] ?? sugerirFator(p.variacao)) || 1;
    const { error } = await supabase.from("estoque_vinculos" as any).insert({
      estoque_item_id: item.id,
      marketplace: p.marketplace,
      item_id: p.item_id,
      model_id: p.model_id,
      fator,
    });
    if (error) return toast.error(error.message);
    toast.success(`Vinculado (×${fator})`);
    onSalvo();
  }

  const vinculadosDoItem = new Set(
    (item?.vinculos ?? []).map((v) => `${v.marketplace}:${v.item_id}:${v.model_id}`),
  );

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Vincular produtos a “{item?.nome}”</DialogTitle>
          <DialogDescription>
            O fator é quantas unidades saem do estoque por unidade vendida — sugerido pela variação
            (ex.: “4 Unidades” → ×4, “1 par” → ×2). Ajuste se precisar.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto, variação ou SKU"
            className="pl-9"
          />
        </div>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
          {filtrados.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum produto encontrado.
            </p>
          )}
          {filtrados.map((p) => {
            const chave = `${p.marketplace}:${p.item_id}:${p.model_id}`;
            const jaNesse = vinculadosDoItem.has(chave);
            const jaEmOutro = !jaNesse && jaVinculados.has(chave);
            return (
              <div
                key={chave}
                className="flex items-center gap-2 rounded-md border border-border/60 p-2"
              >
                <Miniatura
                  url={p.imagem_url}
                  alt={p.produto ?? "produto"}
                  className="size-11 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.produto ?? `item ${p.item_id}`}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.variacao ?? "—"} {p.sku ? `· ${p.sku}` : ""}
                    {jaEmOutro && " · já vinculado a outro item"}
                  </p>
                </div>
                <Input
                  type="number"
                  className="w-16 shrink-0"
                  value={fatores[chave] ?? String(sugerirFator(p.variacao))}
                  onChange={(e) => setFatores({ ...fatores, [chave]: e.target.value })}
                  aria-label="Fator"
                />
                <Button
                  size="sm"
                  variant={jaNesse ? "secondary" : "default"}
                  disabled={jaNesse}
                  onClick={() => vincular(p)}
                >
                  {jaNesse ? "Vinculado" : "Vincular"}
                </Button>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SheetHistorico({ item, onClose }: { item: ItemEstoque | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["estoque-movimentos", item?.id],
    enabled: !!item,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estoque_movimentos" as any)
        .select("id, tipo, quantidade, saldo_apos, origem, order_sn, observacao, created_at")
        .eq("estoque_item_id", item!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  return (
    <Sheet open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Histórico · {item?.nome}</SheetTitle>
        </SheetHeader>
        <div className="space-y-2 p-4 pt-0">
          {isLoading && <Skeleton className="h-24 w-full" />}
          {!isLoading && (data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Sem movimentos ainda.</p>
          )}
          {(data ?? []).map((m) => {
            const q = Number(m.quantidade ?? 0);
            return (
              <div
                key={m.id}
                className="flex items-start gap-3 rounded-md border border-border/60 p-2.5"
              >
                <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    <span className={q < 0 ? "text-destructive" : "text-primary"}>
                      {q > 0 ? "+" : ""}
                      {nf(q)}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      ·{" "}
                      {m.origem === "venda"
                        ? "venda"
                        : m.origem === "cancelamento"
                          ? "cancelamento"
                          : m.tipo}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.created_at ? format(new Date(m.created_at), "dd/MM/yyyy HH:mm") : "—"}
                    {m.order_sn ? ` · pedido ${m.order_sn}` : ""}
                    {m.observacao ? ` · ${m.observacao}` : ""}
                  </p>
                </div>
                {m.saldo_apos != null && (
                  <Badge variant="outline" className="shrink-0 tabular-nums">
                    {nf(Number(m.saldo_apos))}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}