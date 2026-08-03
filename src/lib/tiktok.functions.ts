import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTiktokAuthUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { credenciaisTiktok, urlAutorizacaoTiktok } = await import("./tiktok.server");
    const { faltando } = credenciaisTiktok();
    if (faltando.length > 0) return { ok: false as const, faltando };
    return { ok: true as const, url: urlAutorizacaoTiktok() };
  });

export const runTiktokSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { sincronizarPedidosTiktok, sincronizarProdutosTiktok, sincronizarFinanceiroTiktok } =
      await import("./tiktok-sync.server");
    const pedidos = await sincronizarPedidosTiktok(72);
    const produtos = await sincronizarProdutosTiktok();
    const financeiro = await sincronizarFinanceiroTiktok(15);
    return { pedidos, produtos, financeiro };
  });

export const runTiktokRefresh = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { renovarSeNecessario } = await import("./tiktok-sync.server");
    return await renovarSeNecessario(true);
  });