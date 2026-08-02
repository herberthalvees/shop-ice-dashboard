import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Database, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { CodeBlock } from "@/components/ai-elements/code-block";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const SUGESTOES = [
  "Quanto eu lucraria se vendesse apenas SETAS?",
  "Quais produtos dão prejuízo depois de ads?",
  "Se eu investisse ads só no meu campeão e deixasse os outros orgânicos, qual seria o lucro?",
  "Compare margem dos meus 10 produtos mais vendidos nos últimos 30 dias",
];

const ROTULOS: Record<string, string> = {
  consultar_banco: "consulta ao banco",
  listar_tabelas: "leitura do schema",
  salvar_memoria: "aprendizado salvo",
  esquecer_memoria: "aprendizado removido",
};

type PartTool = {
  type: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function DetalhesAtividade({ partes }: { partes: PartTool[] }) {
  const resumo = partes
    .map((p) => ROTULOS[p.toolName ?? p.type.replace("tool-", "")] ?? "ação")
    .reduce<Record<string, number>>((acc, r) => ({ ...acc, [r]: (acc[r] ?? 0) + 1 }), {});
  const texto = Object.entries(resumo)
    .map(([r, n]) => (n > 1 ? `${n} ${r}s` : `1 ${r}`))
    .join(" · ");

  return (
    <Collapsible className="group/act not-prose">
      <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] text-muted-foreground/70 transition hover:text-foreground">
        <Database className="size-3" />
        {texto}
        <ChevronRight className="size-3 transition-transform group-data-[state=open]/act:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-3 border-l pl-3">
        {partes.map((p, i) => {
          const input = p.input as { sql?: string } | undefined;
          return (
            <div key={i} className="space-y-1.5 text-xs">
              <p className="font-medium text-muted-foreground">
                {ROTULOS[p.toolName ?? p.type.replace("tool-", "")] ?? p.type}
              </p>
              {input?.sql ? (
                <CodeBlock code={input.sql} language="sql" />
              ) : input ? (
                <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
              ) : null}
              {p.errorText && <p className="text-destructive">{p.errorText}</p>}
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ChatIA({
  conversaId,
  mensagensIniciais,
}: {
  conversaId: string;
  mensagensIniciais: UIMessage[];
}) {
  const [texto, setTexto] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { conversaId },
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [conversaId],
  );

  const { messages, sendMessage, status } = useChat({
    id: conversaId,
    messages: mensagensIniciais,
    transport,
    onError: (e) => toast.error(e.message || "Falha ao falar com a IA"),
  });

  const carregando = status === "submitted" || status === "streaming";

  useEffect(() => {
    textarea.current?.focus();
  }, [conversaId, status]);

  async function enviar(valor: string) {
    const limpo = valor.trim();
    if (!limpo || carregando) return;
    setTexto("");
    await sendMessage({ text: limpo });
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col overflow-hidden rounded-2xl border bg-gradient-to-b from-card/50 to-background/40 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)]">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <ConversationEmptyState
                title="Pergunte qualquer coisa sobre a sua loja"
                description="Eu consulto o banco do painel em tempo real: pedidos, produtos, custos, ads, carteira e DRE."
                icon={<Database className="size-6 text-primary" />}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void enviar(s)}
                    className="rounded-lg border bg-background/60 p-3 text-left text-sm text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const ferramentas = m.parts.filter((p) =>
                p.type.startsWith("tool-"),
              ) as unknown as PartTool[];
              const textos = m.parts.filter((p) => p.type === "text");

              return (
                <div key={m.id} className="space-y-2">
                  {ferramentas.length > 0 && m.role === "assistant" && (
                    <DetalhesAtividade partes={ferramentas} />
                  )}
                  {textos.map((part, i) => (
                    <Message from={m.role} key={`${m.id}-${i}`}>
                      <MessageContent
                        className={
                          m.role === "assistant"
                            ? "bg-transparent p-0 text-foreground"
                            : "rounded-2xl bg-primary text-primary-foreground"
                        }
                      >
                        <MessageResponse>
                          {"text" in part ? (part.text as string) : ""}
                        </MessageResponse>
                      </MessageContent>
                    </Message>
                  ))}
                </div>
              );
            })
          )}
          {carregando && <Shimmer>Analisando os dados...</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t bg-background/70 p-3 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl">
          <PromptInput
            className="rounded-2xl"
            onSubmit={(_, e) => {
              e.preventDefault();
              void enviar(texto);
            }}
          >
            <PromptInputTextarea
              ref={textarea}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex: quanto eu lucraria vendendo só SETAS com ads?"
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status} disabled={!texto.trim() || carregando} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}

export function BotaoSugestao({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      {children}
    </Button>
  );
}