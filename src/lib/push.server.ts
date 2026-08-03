import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";

type Dispositivo = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function getVapidPublicKey() {
  return process.env["VAPID_PUBLIC_KEY"] ?? "";
}

function vapidKeys() {
  return {
    subject: process.env["VAPID_SUBJECT"] ?? "mailto:contato@dreamice.shop",
    publicKey: process.env["VAPID_PUBLIC_KEY"] ?? "",
    privateKey: process.env["VAPID_PRIVATE_KEY"] ?? "",
  };
}

/**
 * Reserva o envio de forma idempotente. Retorna false quando aquela
 * referência (ex.: order_sn) já foi notificada antes.
 */
export async function reservarEnvio(tipo: string, referencia: string, titulo: string) {
  const { error } = await supabaseAdmin
    .from("push_envios")
    .insert({ tipo, referencia, titulo });
  if (error) return false;
  return true;
}

export async function enviarPush(opts: {
  titulo: string;
  corpo?: string;
  url?: string;
  tag?: string;
  tipo?: string;
  referencia?: string | null;
  registrar?: boolean;
}) {
  const vapid = vapidKeys();
  if (!vapid.publicKey || !vapid.privateKey) {
    return { ok: false, error: "chaves de push não configuradas" };
  }

  const { data: devices } = await supabaseAdmin
    .from("push_dispositivos")
    .select("id, endpoint, p256dh, auth")
    .eq("ativo", true);

  const dispositivos = (devices ?? []) as Dispositivo[];
  if (dispositivos.length === 0) {
    return { ok: false, error: "nenhum dispositivo registrado", dispositivos: 0, sucesso: 0 };
  }

  const message = {
    data: JSON.stringify({
      title: opts.titulo,
      body: opts.corpo ?? "",
      url: opts.url ?? "/dashboard",
      tag: opts.tag,
    }),
    options: { ttl: 3600, urgency: "high" as const },
  };

  let sucesso = 0;
  const erros: string[] = [];

  for (const dev of dispositivos) {
    const subscription: PushSubscription = {
      endpoint: dev.endpoint,
      expirationTime: null,
      keys: { p256dh: dev.p256dh, auth: dev.auth },
    };
    try {
      const payload = await buildPushPayload(message, subscription, vapid);
      const res = await fetch(dev.endpoint, payload);
      if (res.status >= 200 && res.status < 300) {
        sucesso++;
        await supabaseAdmin
          .from("push_dispositivos")
          .update({ ultimo_envio_em: new Date().toISOString() })
          .eq("id", dev.id);
      } else if (res.status === 404 || res.status === 410) {
        await supabaseAdmin.from("push_dispositivos").delete().eq("id", dev.id);
        erros.push(`${res.status} assinatura expirada`);
      } else {
        erros.push(`${res.status} ${(await res.text()).slice(0, 120)}`);
      }
    } catch (e) {
      erros.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (opts.registrar !== false) {
    if (opts.referencia) {
      await supabaseAdmin
        .from("push_envios")
        .update({
          corpo: opts.corpo ?? null,
          dispositivos: dispositivos.length,
          sucesso,
          erro: erros.length ? erros.join(" | ").slice(0, 500) : null,
        })
        .eq("tipo", opts.tipo ?? "manual")
        .eq("referencia", opts.referencia);
    } else {
      await supabaseAdmin.from("push_envios").insert({
        tipo: opts.tipo ?? "manual",
        titulo: opts.titulo,
        corpo: opts.corpo ?? null,
        dispositivos: dispositivos.length,
        sucesso,
        erro: erros.length ? erros.join(" | ").slice(0, 500) : null,
      });
    }
  }

  return { ok: sucesso > 0, dispositivos: dispositivos.length, sucesso, erros };
}

export async function notificarNovaVenda(pedido: {
  order_sn: string;
  valor_total: number;
  itens?: unknown;
}) {
  const titulo = "Nova venda na Shopee 🎉";
  const reservado = await reservarEnvio("venda", pedido.order_sn, titulo);
  if (!reservado) return { ok: false, error: "já notificado" };

  const valor = Number(pedido.valor_total ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const qtd = Array.isArray(pedido.itens) ? pedido.itens.length : 0;
  const corpo = `${valor}${qtd ? ` · ${qtd} ${qtd === 1 ? "item" : "itens"}` : ""} · ${pedido.order_sn}`;

  return await enviarPush({
    titulo,
    corpo,
    url: "/pedidos",
    tag: `venda-${pedido.order_sn}`,
    tipo: "venda",
    referencia: pedido.order_sn,
  });
}