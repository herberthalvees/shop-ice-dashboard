import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Database, Brain, Table2, Trash2 } from "lucide-react";
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
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const SUGESTOES = [
  "Quanto eu lucraria se vendesse apenas SETAS?",
  "Quais produtos dão prejuízo depois de ads?",
  "Se eu investisse ads só no meu campeão e deixasse os outros orgânicos, qual seria o lucro?",
  "Compare margem dos meus 10 produtos mais vendidos nos últimos 30 dias",
];

const ICONES_FERRAMENTA: Record<string, typeof Database> = {
  consultar_banco: Database,
  listar_tabelas: Table2,
  salvar_memoria: Brain,
  esquecer_memoria: Trash2,
};

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
        headers: async () => {
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
    <div className="flex h-[calc(100vh-10rem)] flex-col overflow-hidden rounded-xl border bg-card/40">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
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
            messages.map((m) => (
              <div key={m.id} className="space-y-2">
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <Message from={m.role} key={`${m.id}-${i}`}>
                        <MessageContent
                          className={m.role === "assistant" ? "bg-transparent p-0 text-foreground" : undefined}
                        >
                          <MessageResponse>{part.text}</MessageResponse>
                        </MessageContent>
                      </Message>
                    );
                  }
                  if (part.type.startsWith("tool-")) {
                    const tp = part as ToolPart;
                    const nome = ("toolName" in tp && tp.toolName) || part.type.replace("tool-", "");
                    const Icone = ICONES_FERRAMENTA[nome] ?? Database;
                    return (
                      <Tool defaultOpen={false} key={`${m.id}-${i}`}>
                        <ToolHeader
                          type={tp.type}
                          state={tp.state}
                          icon={<Icone className="size-3.5" />}
                          title={nome === "consultar_banco" ? "Consultando o banco" : nome}
                        />
                        <ToolContent>
                          <ToolInput input={tp.input} />
                          <ToolOutput output={tp.output} errorText={tp.errorText} />
                        </ToolContent>
                      </Tool>
                    );
                  }
                  return null;
                })}
              </div>
            ))
          )}
          {status === "submitted" && <Shimmer>Analisando os dados...</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t bg-background/60 p-3">
        <div className="mx-auto w-full max-w-3xl">
          <PromptInput
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