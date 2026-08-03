import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";

async function handler({ request }: { request: Request }) {
  const unauth = checkCronSecret(request);
  if (unauth) return unauth;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getConversationList } = await import("@/lib/shopee.server");
  const { data } = await supabaseAdmin.from("shopee_connection").select("*").eq("app_tipo", "principal").maybeSingle();
  const raw = await getConversationList(data!.access_token!, Number(data!.shop_id), { pageSize: 10 });
  return new Response(JSON.stringify(raw, null, 2), { headers: { "Content-Type": "application/json" } });
}

export const Route = createFileRoute("/api/public/shopee/dbg-chat")({
  server: { handlers: { GET: handler } },
});
