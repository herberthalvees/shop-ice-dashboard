# Dream Ice Dashboard

Crie um painel web privado chamado "Dream Ice" para acompanhar minha loja

Shopee via API. É um sistema de uso pessoal, com um único usuário.

## STACK

React + TypeScript + Tailwind + shadcn/ui + Supabase (Auth, Postgres,

Edge Functions, Cron). Tema escuro, visual limpo, PT-BR.

## AUTENTICAÇÃO

- Login com e-mail e senha via Supabase Auth

- NÃO crie tela de cadastro público nem landing page — a conta será criada

  manualmente por mim no painel do Supabase

- Todas as rotas protegidas; sem sessão vai para /login

- Recuperação de senha por e-mail

## SEGURANÇA

Habilite RLS em todas as tabelas com política simples: acesso permitido a

usuários autenticados (auth.role() = 'authenticated'). Nunca use a

service_role key no frontend. SHOPEE_PARTNER_ID e SHOPEE_PARTNER_KEY ficam

como secrets do Supabase, acessíveis apenas pelas Edge Functions.

## MODELO DE DADOS

shopee_connection   (uma linha só)

- id, shop_id (bigint), shop_name (text)

- access_token, refresh_token (text)

- token_expires_at (timestamptz)

- status (text: 'ativa' | 'expirada' | 'revogada')

- updated_at

pedidos

- id (uuid, PK), order_sn (text, UNIQUE)

- status (text), valor_total (numeric)

- comprador_username (text)

- itens (jsonb), payload_json (jsonb)

- data_criacao_pedido (timestamptz)

- created_at, updated_at

produtos

- id (uuid, PK), item_id (bigint, UNIQUE)

- nome (text), sku (text), preco (numeric)

- estoque (integer), status (text), updated_at

eventos_log

- id (uuid, PK), tipo_evento (text), payload (jsonb)

- notificado (boolean), erro (text), created_at

config

- id (int, PK, sempre 1)

- webhook_whatsapp_url (text)

- eventos (jsonb) -- {"novo_pedido":true,"pedido_cancelado":true,

                      "pedido_enviado":false,"estoque_baixo":true}

- limite_estoque_baixo (integer, default 5)

- notificacoes_ativas (boolean)

Índices em pedidos(status), pedidos(data_criacao_pedido), produtos(estoque).

## EDGE FUNCTIONS (Deno)

1) shopee-auth-url [requer JWT]

   Gera a URL de autorização:

   sign = HMAC-SHA256(partner_id + path + timestamp, PARTNER_KEY)

   https://partner.shopeemobile.com/api/v2/shop/auth_partner

   ?partner_id=..&timestamp=..&sign=..&redirect=<url do callback>

2) shopee-oauth-callback [público, verify_jwt = false]

   Recebe ?code=..&shop_id=.., chama /api/v2/auth/token/get,

   grava/atualiza a linha única de shopee_connection,

   redireciona para /configuracoes?conectado=1

3) shopee-webhook [público, verify_jwt = false]

   - Valida o header Authorization: HMAC-SHA256(url + "|" + body, PARTNER_KEY).

     Se inválido, 401.

   - Grava em eventos_log e faz upsert em pedidos pelo order_sn.

   - Se config.notificacoes_ativas e o tipo do evento estiver habilitado,

     faz POST em config.webhook_whatsapp_url com JSON:

     { evento, order_sn, status, valor_total, comprador, itens, timestamp }

   - Marca eventos_log.notificado. Responde 200 sempre e rápido.

4) shopee-refresh-token [cron a cada 3h]

   Renova o access_token via /api/v2/auth/access_token/get antes de expirar.

   Se falhar, marca status='expirada'.

5) shopee-sync [cron a cada 1h + botão manual]

   Puxa pedidos das últimas 24h (get_order_list + get_order_detail) e a

   lista de produtos (get_item_list + get_item_base_info). Faz upsert.

   Serve de rede de segurança caso algum webhook se perca.

## TELAS

/dashboard

- Cards: pedidos hoje, faturamento hoje, faturamento do mês,

  pedidos aguardando envio, produtos com estoque baixo

- Gráfico de linha: pedidos e faturamento dos últimos 30 dias (recharts)

- Gráfico de barras: top 10 produtos mais vendidos no período

- Lista dos 10 pedidos mais recentes

- Seletor de período (7d / 30d / 90d) afetando os gráficos

/pedidos

- Tabela com busca por order_sn ou comprador, filtro por status e período

- Paginação server-side, ordenação por data e valor

- Clique abre drawer com detalhe completo e os itens do pedido

- Botão exportar CSV do resultado filtrado

/produtos

- Tabela: nome, SKU, preço, estoque, status

- Filtro rápido "estoque baixo" usando config.limite_estoque_baixo

- Destaque visual em vermelho para itens abaixo do limite

/notificacoes

- Campo para a URL do webhook (n8n) e checkboxes por tipo de evento

- Campo numérico para o limite de estoque baixo

- Toggle geral de ativar/desativar

- Botão "Enviar teste" que dispara um payload de exemplo

- Histórico das últimas 50 entradas de eventos_log com status e erro

/configuracoes

- Status da conexão Shopee (loja, shop_id, validade do token)

- Botão "Conectar loja" / "Reconectar" que chama shopee-auth-url

- Botão "Sincronizar agora" que dispara shopee-sync

- Troca de senha

- Nunca exibir access_token, refresh_token ou partner_key na interface

## UX

Sidebar fixa, skeleton nos loadings, toasts de sucesso/erro, estados vazios

com instrução do próximo passo, responsivo para mobile.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://shop-ice-dashboard.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/73ef96e5-75af-4341-beba-ebd8e4a66fc1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
