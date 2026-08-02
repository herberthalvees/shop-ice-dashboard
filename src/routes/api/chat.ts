import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider, getLovableAiGatewayRunId } from "@/lib/ai-gateway.server";
import { clienteUsuario, memoriaAtual, promptSistema, resumoSchema } from "@/lib/ia-chat.server";

type CorpoChat = { messages?: unknown; conversaId?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
        if (!token) return new Response("Não autenticado", { status: 401 });

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("LOVABLE_API_KEY ausente", { status: 500 });

        const corpo = (await request.json()) as CorpoChat;
        if (!Array.isArray(corpo.messages)) {
          return new Response("messages obrigatório", { status: 400 });
        }
        const conversaId = typeof corpo.conversaId === "string" ? corpo.conversaId : null;
        const mensagens = corpo.messages as UIMessage[];

        const supabase = clienteUsuario(token);

        // Confirma que o chamador é o dono do painel antes de dar acesso ao banco.
        const { data: ehOwner, error: erroOwner } = await supabase.rpc("eh_owner");
        if (erroOwner || ehOwner !== true) {
          return new Response("Acesso restrito ao dono do painel", { status: 403 });
        }

        if (conversaId) {
          const { data: conversa } = await supabase
            .from("ia_conversas")
            .select("id")
            .eq("id", conversaId)
            .maybeSingle();
          if (!conversa) return new Response("Conversa não encontrada", { status: 404 });
        }

        const [schema, memoria] = await Promise.all([resumoSchema(supabase), memoriaAtual(supabase)]);

        const gateway = createLovableAiGatewayProvider(apiKey, getLovableAiGatewayRunId(request));

        const consultar_banco = tool({
          description:
            "Executa uma consulta SELECT/WITH somente-leitura no banco do painel e devolve as linhas em JSON. Use nomes de tabela do schema informado.",
          inputSchema: z.object({
            titulo: z.string().describe("Resumo curto do que a consulta busca, em português."),
            sql: z.string().describe("Uma única instrução SELECT ou WITH, sem ponto e vírgula."),
            limite: z.number().int().describe("Máximo de linhas a retornar (1 a 1000)."),
          }),
          execute: async ({ sql, limite }) => {
            const { data, error } = await supabase.rpc("ia_sql", {
              consulta: sql,
              limite: Math.min(Math.max(Math.trunc(limite || 200), 1), 1000),
            });
            if (error) return { ok: false, erro: error.message };
            const linhas = Array.isArray(data) ? data : [];
            return { ok: true, linhas: linhas.length, dados: linhas };
          },
        });

        const listar_tabelas = tool({
          description: "Lista todas as tabelas e colunas disponíveis no banco do painel.",
          inputSchema: z.object({
            filtro: z.string().describe("Parte do nome da tabela; use string vazia para tudo."),
          }),
          execute: async ({ filtro }) => {
            const { data, error } = await supabase.rpc("ia_schema");
            if (error) return { ok: false, erro: error.message };
            const tabelas = (Array.isArray(data) ? data : []) as { tabela: string }[];
            const f = (filtro || "").toLowerCase();
            return { ok: true, tabelas: f ? tabelas.filter((t) => t.tabela.toLowerCase().includes(f)) : tabelas };
          },
        });

        const salvar_memoria = tool({
          description:
            "Guarda um aprendizado estável sobre o negócio para reutilizar nas próximas conversas (regra, apelido de produto, consulta que funcionou, preferência do dono).",
          inputSchema: z.object({
            tipo: z.string().describe("Um de: fato, regra, consulta, preferencia."),
            chave: z.string().describe("Identificador curto e único do aprendizado."),
            conteudo: z.string().describe("O aprendizado em si, claro e autoexplicativo."),
          }),
          execute: async ({ tipo, chave, conteudo }) => {
            const { error } = await supabase
              .from("ia_memoria")
              .upsert({ tipo, chave, conteudo }, { onConflict: "tipo,chave" });
            if (error) return { ok: false, erro: error.message };
            return { ok: true, salvo: `${tipo}/${chave}` };
          },
        });

        const esquecer_memoria = tool({
          description: "Remove um aprendizado da memória quando ele ficou incorreto ou obsoleto.",
          inputSchema: z.object({
            tipo: z.string(),
            chave: z.string(),
          }),
          execute: async ({ tipo, chave }) => {
            const { error } = await supabase
              .from("ia_memoria")
              .delete()
              .eq("tipo", tipo)
              .eq("chave", chave);
            return error ? { ok: false, erro: error.message } : { ok: true };
          },
        });

        const resultado = streamText({
          model: gateway("openai/gpt-5.6-sol"),
          system: promptSistema(schema, memoria),
          messages: await convertToModelMessages(mensagens),
          tools: { consultar_banco, listar_tabelas, salvar_memoria, esquecer_memoria },
          stopWhen: stepCountIs(50),
          providerOptions: { lovable: { reasoningEffort: "none" } },
        });

        return resultado.toUIMessageStreamResponse({
          originalMessages: mensagens,
          onFinish: async ({ messages }) => {
            if (!conversaId) return;
            const novas = messages.slice(-2);
            for (const m of novas) {
              const { error } = await supabase.from("ia_mensagens").insert({
                conversa_id: conversaId,
                msg_id: m.id,
                role: m.role,
                parts: m.parts as unknown as object,
              });
              if (error) console.error("falha ao salvar mensagem ia", error.message);
            }
            const primeiroTexto = novas
              .find((m) => m.role === "user")
              ?.parts.find((p) => p.type === "text");
            const titulo =
              primeiroTexto && "text" in primeiroTexto ? primeiroTexto.text.slice(0, 60) : null;
            const { count } = await supabase
              .from("ia_mensagens")
              .select("id", { count: "exact", head: true })
              .eq("conversa_id", conversaId);
            await supabase
              .from("ia_conversas")
              .update({
                updated_at: new Date().toISOString(),
                ...(titulo && (count ?? 0) <= 2 ? { titulo } : {}),
              })
              .eq("id", conversaId);
          },
        });
      },
    },
  },
});