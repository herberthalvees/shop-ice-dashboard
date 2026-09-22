import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function validarLojaId(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export const listarConversasShopee = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { lojaId?: number }) => ({ lojaId: validarLojaId(data?.lojaId) }))
  .handler(async ({ data }) => {
    try {
      const { listarConversas } = await import("./chat.server");
      return await listarConversas(data.lojaId);
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

export const listarMensagensShopee = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { conversationId: string; buyerId?: string; lojaId?: number }) => {
    const id = String(data?.conversationId ?? "").trim();
    if (!/^\d{1,32}$/.test(id)) throw new Error("conversa inválida");
    const buyerId = String(data?.buyerId ?? "").trim();
    return {
      conversationId: id,
      buyerId: /^\d{1,32}$/.test(buyerId) ? buyerId : undefined,
      lojaId: validarLojaId(data?.lojaId),
    };
  })
  .handler(async ({ data }) => {
    const { listarMensagens } = await import("./chat.server");
    return await listarMensagens(data.conversationId, data.buyerId, data.lojaId);
  });

export const enviarMensagemShopee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      toId: string;
      texto: string;
      conversationId?: string;
      comprador?: string;
      lojaId?: number;
    }) => {
      const toId = String(data?.toId ?? "").trim();
      const texto = String(data?.texto ?? "").trim();
      if (!/^\d{1,32}$/.test(toId)) throw new Error("destinatário inválido");
      if (texto.length < 1 || texto.length > 2000)
        throw new Error("mensagem deve ter entre 1 e 2000 caracteres");
      const conversationId = String(data?.conversationId ?? "").trim();
      return {
        toId,
        texto,
        conversationId: /^\d{1,32}$/.test(conversationId) ? conversationId : undefined,
        comprador: typeof data?.comprador === "string" ? data.comprador.slice(0, 120) : undefined,
        lojaId: validarLojaId(data?.lojaId),
      };
    },
  )
  .handler(async ({ data }) => {
    const { enviarMensagem } = await import("./chat.server");
    return await enviarMensagem(data);
  });
