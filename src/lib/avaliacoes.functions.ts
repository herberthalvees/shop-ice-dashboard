import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function validarId(v: unknown) {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw new Error("avaliação inválida");
  return id;
}

export const sincronizarAvaliacoesShopee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { sincronizarAvaliacoes } = await import("./avaliacoes.server");
    return await sincronizarAvaliacoes(3);
  });

export const gerarRespostaAvaliacaoIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { commentId: number }) => ({ commentId: validarId(data?.commentId) }))
  .handler(async ({ data }) => {
    const { gerarRespostaAvaliacao } = await import("./avaliacoes.server");
    return await gerarRespostaAvaliacao(data.commentId);
  });

export const enviarRespostaAvaliacaoShopee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { commentId: number; texto: string }) => {
    const texto = String(data?.texto ?? "").trim();
    if (texto.length < 1 || texto.length > 500) throw new Error("resposta deve ter entre 1 e 500 caracteres");
    return { commentId: validarId(data?.commentId), texto };
  })
  .handler(async ({ data }) => {
    const { enviarRespostaAvaliacao } = await import("./avaliacoes.server");
    return await enviarRespostaAvaliacao(data.commentId, data.texto);
  });
