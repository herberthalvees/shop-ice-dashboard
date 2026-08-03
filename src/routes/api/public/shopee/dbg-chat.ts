import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request);
  if (unauth) return unauth;
  const url = new URL(request.url);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { shopUrl } = await import("@/lib/shopee.server");
  const { data } = await supabaseAdmin.from("shopee_connection").select("*").eq("app_tipo", "principal").maybeSingle();
  const out: any = {};
  for (const type of ["all", "unread", "pinned"]) {
    for (const direction of ["older", "latest"]) {
      const u = shopUrl("/api/v2/sellerchat/get_conversation_list", data!.access_token!, Number(data!.shop_id), {
        type, direction, page_size: "50",
      });
      const j: any = await (await fetch(u)).json();
      out[`${type}-${direction}`] = j.error
        ? { error: j.error, message: j.message }
        : (j.response?.conversations ?? []).map((c: any) => `${c.to_name} u=${c.unread_count} ${new Date(Number(c.last_message_timestamp) / 1e6).toISOString()}`);
    }
  }
  const uc = shopUrl("/api/v2/sellerchat/get_unread_conversation_count", data!.access_token!, Number(data!.shop_id), {});
  out.unread_count = await (await fetch(uc)).json();
  if (url.searchParams.get("raw")) out.raw = true;
  return new Response(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json" } });
}

export const Route = createFileRoute("/api/public/shopee/dbg-chat")({
  server: { handlers: { GET: handler } },
});
