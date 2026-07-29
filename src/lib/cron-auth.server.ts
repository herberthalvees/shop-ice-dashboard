export function checkCronSecret(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return new Response(
      JSON.stringify({ ok: false, erro: "CRON_SECRET nao configurado" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const url = new URL(request.url);
  const provided = url.searchParams.get("s");
  if (provided !== expected) {
    return new Response(
      JSON.stringify({ ok: false, erro: "nao autorizado" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  return null;
}