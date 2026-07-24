## Dream Ice — Painel privado da loja Shopee

Sistema pessoal single-user com Supabase (Auth + Postgres + Edge Functions + Cron) e frontend React/TS/Tailwind/shadcn em tema escuro PT-BR.

### Ordem de execução

**1. Backend (Lovable Cloud + Supabase)**
- Habilitar Lovable Cloud
- Migração SQL:
  - Tabelas: `shopee_connection`, `pedidos`, `produtos`, `eventos_log`, `config` (com linha única id=1 pré-populada)
  - Índices: `pedidos(status)`, `pedidos(data_criacao_pedido)`, `produtos(estoque)`
  - RLS habilitado em todas; policy única `auth.role() = 'authenticated'` para SELECT/INSERT/UPDATE/DELETE
  - GRANTs para `authenticated` e `service_role`
- Secrets: `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY` (solicitados via add_secret)

**2. Edge Functions (Deno)**
- `shopee-auth-url` (JWT) — gera URL OAuth com HMAC-SHA256
- `shopee-oauth-callback` (público) — troca code→token, upsert em `shopee_connection`, redireciona `/configuracoes?conectado=1`
- `shopee-webhook` (público) — valida assinatura HMAC do header Authorization, log em `eventos_log`, upsert em `pedidos`, dispara WhatsApp webhook se habilitado, responde 200 rápido
- `shopee-refresh-token` (cron 3h) — renova token, marca `expirada` em falha
- `shopee-sync` (cron 1h + manual) — puxa pedidos 24h + produtos, upsert

Cron via `pg_cron` invocando as functions.

**3. Frontend — Auth**
- Rota `/login` (email + senha, sem cadastro público)
- Rota `/recuperar-senha` + `/reset-password`
- Layout `_authenticated` protegendo o resto
- `onAuthStateChange` em `__root.tsx`, invalidação de router/queries
- Sem landing pública — `/` redireciona para `/dashboard` (ou `/login`)

**4. Frontend — Layout**
- Sidebar fixa (shadcn) com navegação: Dashboard, Pedidos, Produtos, Notificações, Configurações + Sair
- Tema escuro definido no design system (`src/styles.css` — oklch tokens escuros por padrão, sem toggle)
- Skeletons, toasts (sonner), empty states padrão

**5. Telas**
- **/dashboard** — 5 cards KPI, gráfico linha 30d (recharts), barras top 10 produtos, últimos 10 pedidos, seletor 7/30/90d
- **/pedidos** — tabela com busca (order_sn/comprador), filtro status+período, paginação server-side, ordenação data/valor, drawer detalhe, export CSV do filtrado
- **/produtos** — tabela nome/SKU/preço/estoque/status, filtro "estoque baixo", destaque vermelho abaixo do limite
- **/notificacoes** — form URL webhook, checkboxes eventos, limite estoque, toggle geral, botão "Enviar teste", histórico últimos 50 `eventos_log`
- **/configuracoes** — status conexão (loja, shop_id, validade), botão Conectar/Reconectar, botão Sincronizar agora, troca de senha. Nunca exibir tokens/partner_key.

**6. Data layer**
- Server functions TanStack (`createServerFn` + `requireSupabaseAuth`) para queries agregadas do dashboard
- TanStack Query para leituras de tabela via cliente supabase autenticado (RLS)
- Chamadas às edge functions Shopee via `supabase.functions.invoke`

### Notas técnicas
- Stack real do template: **TanStack Start** (não Vite+React Router). Uso `createFileRoute` em `src/routes/`, `_authenticated/` para gate.
- Redirect URI Shopee = URL pública da edge `shopee-oauth-callback` no Supabase.
- Webhook WhatsApp: POST JSON conforme spec, com timeout curto para não bloquear resposta 200 ao Shopee.
- CSV export gerado client-side a partir do resultado filtrado atual.
- Config pré-populada com defaults do spec (limite 5, todos eventos exceto `pedido_enviado`, notificações ativas=false até URL configurada).

### O que preciso de você depois de aprovar
1. Confirmar habilitação do Lovable Cloud (farei a chamada).
2. Fornecer `SHOPEE_PARTNER_ID` e `SHOPEE_PARTNER_KEY` quando eu abrir o formulário seguro.
3. Criar seu usuário no painel Supabase (Auth → Users) — não haverá tela de signup.

Depois de aprovado, executo tudo em sequência: DB → Edge Functions → Auth → Layout → Telas.