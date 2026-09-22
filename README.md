# Dream Ice Dashboard

Painel privado (uso interno, PT-BR) para gerenciar uma ou mais lojas Shopee
a partir de um único lugar: pedidos, produtos, estoque, financeiro, ads,
avaliações, chat e pós-venda — com sincronização automática direto da API
da Shopee.

O projeto nasceu para **uma** loja (Dream Ice) e evoluiu para suportar
**múltiplas lojas Shopee**, cada uma com CNPJ e app próprio cadastrado no
Shopee Open Platform, filtráveis individualmente ou em conjunto em todas as
telas.

## Sumário

- [Stack](#stack)
- [Arquitetura em 1 minuto](#arquitetura-em-1-minuto)
- [Multi-loja](#multi-loja)
- [Telas](#telas)
- [Integração com a Shopee](#integração-com-a-shopee)
- [Jobs agendados (cron)](#jobs-agendados-cron)
- [Modelo de dados](#modelo-de-dados-resumo)
- [Variáveis de ambiente / secrets](#variáveis-de-ambiente--secrets)
- [Desenvolvimento local](#desenvolvimento-local)
- [Deploy (Lovable)](#deploy-lovable)
- [Estrutura de pastas](#estrutura-de-pastas)

## Stack

- **React + TypeScript**, roteado e servido por **TanStack Start** (SSR +
  server functions + rotas de API no mesmo app — não é só um SPA)
- **Tailwind + shadcn/ui**, tema escuro
- **Supabase**: Postgres (com RLS), Auth (e-mail/senha, usuário único por
  enquanto), `pg_cron` + `pg_net` pros jobs agendados
- **Shopee Open Platform** (API v2) — pedidos, produtos, ads, carteira,
  escrow, avaliações e seller chat
- **DreamAI**: chat interno que consulta o banco via IA (Lovable AI
  Gateway) pra responder perguntas em português com números reais do
  painel, e também gera respostas de avaliações e sugestões de mensagem de
  pós-venda
- Deploy e hospedagem via **Lovable**, publicado em `dreamice.shop`

## Arquitetura em 1 minuto

Não existe backend separado: o mesmo app TanStack Start expõe tanto as
telas (`src/routes/_authenticated/*.lazy.tsx`) quanto as rotas de API
server-side (`src/routes/api/**`) e *server functions* (`src/lib/*.functions.ts`
chamadas do client via `useServerFn`). Toda a lógica de negócio pesada mora
em `src/lib/*.server.ts` (só roda no servidor, nunca é enviada pro
navegador).

A sincronização com a Shopee acontece em dois níveis:

1. **Jobs agendados** (`pg_cron` no Supabase, ver [abaixo](#jobs-agendados-cron))
   chamam rotas públicas em `src/routes/api/public/shopee/*` de tempos em
   tempos, autenticadas por um secret compartilhado (`?s=CRON_SECRET`) — é
   assim que pedidos, produtos, ads, carteira etc. ficam atualizados sem
   ninguém precisar abrir o painel.
2. **Webhook** (`/api/public/shopee/webhook`): a Shopee empurra eventos em
   tempo real (novo pedido, chat, etc.) pra essa rota, que valida a
   assinatura HMAC e reage na hora (ex.: notificação push de novo chat).

O acesso ao banco a partir do servidor usa a `service_role` key
(`supabaseAdmin`, nunca exposta ao navegador); o frontend usa a chave
pública com RLS.

## Multi-loja

Cada loja cadastrada em **Lojas** (`/lojas`) pode ter:

- Seu **próprio app Shopee** (CNPJ diferente = app/partner_id/partner_key
  diferentes) — cadastrado ali mesmo, na tela, por app (`principal` e
  `ads`). Se a loja não tiver credencial própria, o sistema cai para as
  variáveis de ambiente globais (`SHOPEE_PARTNER_ID`/`KEY`), que é como a
  loja original continua funcionando sem precisar recadastrar nada.
- Suas próprias credenciais Shopee (`shopee_connection`, uma linha por
  `loja_id` + `app_tipo`), tokens renovados automaticamente.
- Um botão de **backfill de histórico de pedidos** (os crons só puxam pra
  frente a partir do momento em que a loja conecta).

Quase toda tabela de negócio tem uma coluna `loja_id`, e as telas
principais têm um seletor "Loja A / Loja B / Ambas" que filtra os dados
(`src/lib/lojas-filtro-store.ts`). A única exceção proposital é o
**estoque físico**, que é compartilhado entre todas as lojas (uma peça em
estoque serve qualquer canal — ver tela **Estoque**).

⚠️ **Importante para quem for adicionar uma loja nova:** o domínio de
redirect cadastrado no console da Shopee para o app daquela loja precisa
bater com o domínio real do painel (`dreamice.shop`). Se o app foi criado
apontando para outro domínio (ex.: a URL de preview do Lovable), a
autorização falha com `"The domain of redirect is not consistent..."` —
ajuste o domínio no console da Shopee (mais simples) ou defina
`SHOPEE_REDIRECT_ORIGIN`/`SHOPEE_ADS_REDIRECT_ORIGIN` (ver
[variáveis de ambiente](#variáveis-de-ambiente--secrets)).

## Telas

Organizadas como no menu lateral (`src/components/app-sidebar.tsx`):

**Visão geral**
| Tela | Rota | O que mostra |
|---|---|---|
| Dashboard | `/dashboard` | KPIs do período (faturamento, lucro, vendas, ticket médio, pedidos em trânsito, ads), gráficos e top produtos |
| DreamAI | `/ia` | Chat com IA que consulta o banco do painel e responde com números reais |

**Operação**
| Tela | Rota | O que mostra |
|---|---|---|
| Pedidos | `/pedidos` | Lucro por item vendido, com filtro/busca e detalhe por pedido |
| Produtos | `/produtos` | Catálogo, estoque, giro e desempenho em ads por SKU |
| Estoque | `/estoque` | Estoque físico **compartilhado entre lojas**; abate automático a cada venda sincronizada |
| Chat | `/chat` | Atende os compradores pelo seller chat da Shopee, com respostas rápidas |
| Avaliações | `/avaliacoes` | Avaliações recebidas + respostas geradas pelo DreamAI (ou textos de referência) |
| Pós-venda | `/pos-venda` | Campanhas de mensagem com cupom (fila com ritmo/limite diário) e envio manual por contato |
| Precificação | `/precificacao` | Margem real e preço mínimo por SKU, a partir dos custos cadastrados |
| Calculadora | `/calculadora` | Simulador avulso de comissão, imposto, custo e margem |

**Financeiro**
| Tela | Rota | O que mostra |
|---|---|---|
| Financeiro | `/financeiro` | Movimentações da carteira Shopee (saldo, taxas, saques) |
| DRE | `/dre` | Demonstrativo de resultado mensal |

**Sistema**
| Tela | Rota | O que mostra |
|---|---|---|
| Lojas | `/lojas` | Cadastro de lojas, credenciais por app, status de conexão, backfill de histórico |
| Notificações | `/notificacoes` | Webhook do WhatsApp (via n8n) por tipo de evento + push notifications |
| Configurações | `/configuracoes` | Conta, troca de senha, atalhos legados de conexão/sync |

## Integração com a Shopee

Toda a lógica de assinatura HMAC e chamada à API da Shopee está
centralizada em `src/lib/shopee.server.ts` (nada de HMAC duplicado
espalhado pelo projeto). O fluxo de autorização de uma loja:

1. **`/lojas`** → botão "Conectar" chama a server function
   `getShopeeAuthUrl` (`src/lib/shopee.functions.ts`), que monta a URL de
   autorização da Shopee assinada com a credencial daquela loja+app.
2. O usuário autoriza no site da Shopee, que redireciona para
   `/api/public/shopee/callback` (app principal) ou `callback-ads`.
3. O callback troca o `code` pelo `access_token`/`refresh_token` e grava em
   `shopee_connection` (upsert por `loja_id` + `app_tipo`).
4. `refresh-token.ts` (cron) renova o token antes de expirar; `watchdog.ts`
   detecta conexões travadas e força uma recuperação.

Cada rotina de sync (`sync.ts`, `sync-produtos.ts`, `sync-ads.ts`,
`sync-carteira.ts`, `sync-escrow.ts`, `sync-avaliacoes.ts`, `sync-chat.ts`)
busca as lojas ativas (`listarLojasAtivas`, `src/lib/lojas.server.ts`) e
roda a sincronização **para cada uma**, gravando `loja_id` em cada linha.

## Jobs agendados (cron)

Configurados via `pg_cron`/`pg_net` direto no Postgres do Supabase (não
aparecem como "Edge Functions" — são `net.http_get`/`http_post` batendo
nas rotas abaixo, autenticados por `?s=<CRON_SECRET>`):

| Job | Frequência | Rota | O que faz |
|---|---|---|---|
| `shopee-sync-10min` | a cada 10 min | `/sync` | Pedidos recentes (janela curta, por `update_time`) |
| `shopee-sync-produtos` | a cada hora | `/sync-produtos` | Catálogo, preço e estoque Shopee |
| `shopee-sync-ads` | a cada 3h | `/sync-ads` | Campanhas e performance de Shopee Ads |
| `shopee-sync-carteira` | a cada 30 min | `/sync-carteira` | Transações da carteira Shopee |
| `shopee-sync-escrow` | a cada 15 min | `/sync-escrow` | Detalhe de repasse (escrow) por pedido |
| `shopee-sync-chat` | a cada 5 min | `/sync-chat` | Notifica push quando chega mensagem nova no chat |
| `shopee-sync-avaliacoes` | a cada hora | `/sync-avaliacoes` | Busca avaliações novas e responde as automáticas |
| `shopee-refresh-token` | a cada 2h | `/refresh-token` | Renova tokens perto de expirar |
| `shopee-watchdog` | a cada 5 min | `/watchdog` | Detecta sync travado/loja desconectada e força recuperação |
| `shopee-resumo-fechamento` | 1x/dia (horário configurável) | `/resumo-diario` | Envia o resumo diário por WhatsApp |
| `pos-venda-contatos` | 1x/dia às 06:20 | `/pos-venda?acao=contatos` | Atualiza a lista de contatos alcançáveis pelo chat |
| `pos-venda-fila` | a cada 5 min | `/pos-venda?acao=fila` | Processa a fila de campanhas de pós-venda |

Todas essas rotas também podem ser chamadas manualmente (curl/Postman) com
o mesmo `?s=<CRON_SECRET>` — útil pra depurar sem esperar o cron.

**Backfill de histórico**: os jobs acima só sincronizam pedidos pra frente
a partir de agora. Pra trazer o histórico de uma loja recém-conectada, use
o botão "Sincronizar histórico" na tela **Lojas** (chama `/sync` com um
`loja_id` e uma janela de dias maior, sem precisar do secret na mão).

## Modelo de dados (resumo)

Schema completo em `supabase/migrations/`. Agrupado por assunto:

- **Loja/conexão**: `lojas`, `shopee_connection` (+ view
  `shopee_connection_status`, sem os tokens), `sync_log`
- **Pedidos e produtos**: `pedidos`, `produtos`, `produto_custos`
- **Estoque** (compartilhado entre lojas): `estoque_itens`,
  `estoque_movimentos`, `estoque_vinculos`
- **Financeiro**: `carteira_transacoes`, `despesas_fixas`,
  `despesas_variaveis`
- **Ads**: `ads_campanhas`
- **Avaliações**: `avaliacoes`, `avaliacoes_exemplos`
- **Chat e pós-venda**: `chat_envios`, `chat_respostas_rapidas`,
  `pv_contatos`, `pv_campanhas`, `pv_cupons`, `pv_envios`,
  `pv_envios_manuais`, `pv_optout`
- **DreamAI**: `ia_conversas`, `ia_mensagens`, `ia_memoria`, `ia_uso`
- **Notificações push**: `push_dispositivos`, `push_envios`
- **Sistema**: `config`, `eventos_log`, `alertas_enviados`,
  `resumo_horarios`

RLS habilitado em todas as tabelas (leitura para usuários autenticados;
`shopee_connection` e afins só liberam colunas sem segredo — tokens e
`partner_key` só são lidos pela `service_role`, nunca pelo frontend).

> ⚠️ Este repositório **não tem ambiente de staging**: toda migração em
> `supabase/migrations/` precisa ser aplicada manualmente no banco de
> produção (SQL Editor do Supabase) — o Lovable não roda migração
> sozinho, só sincroniza o código. Depois de rodar uma migração nova,
> **publique o projeto no Lovable** pra esse código ir ao ar.

## Variáveis de ambiente / secrets

Configuradas como secrets do projeto (Lovable/Supabase), nunca commitadas.

| Variável | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Acesso ao Postgres/Auth |
| `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY` | Credencial global do app "principal" (fallback quando a loja não tem credencial própria) |
| `SHOPEE_ADS_PARTNER_ID`, `SHOPEE_ADS_PARTNER_KEY` | Idem, para o app "Ads" |
| `SHOPEE_API_BASE` | Base da API da Shopee (`https://partner.shopeemobile.com`) |
| `SHOPEE_REDIRECT_ORIGIN`, `SHOPEE_ADS_REDIRECT_ORIGIN` | *(opcional)* fixa o domínio enviado no `redirect` do OAuth, caso precise divergir do domínio de quem está clicando em "Conectar" |
| `SHOPEE_PUSH_URL` | URL pública do webhook, usada pra validar a assinatura HMAC do push |
| `CRON_SECRET` | Autoriza os jobs agendados (e chamadas manuais) nas rotas `/api/public/shopee/*` |
| `LOVABLE_API_KEY` | Lovable AI Gateway — DreamAI, respostas de avaliação e sugestões de pós-venda |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push notifications |

Credenciais **por loja** (Partner ID/Key de um app específico) não são
variáveis de ambiente — ficam em `shopee_connection.partner_id/partner_key`,
cadastradas pela própria tela de **Lojas**.

## Desenvolvimento local

```sh
git clone <url-do-repositório>
cd shop-ice-dashboard
npm i
npm run dev
```

Outros comandos úteis:

```sh
npm run build   # build de produção (roda antes de todo push)
npm run lint    # eslint
npm run format  # prettier --write
```

Não existe banco local/staging — o app aponta pro Supabase de produção
mesmo em desenvolvimento, então qualquer teste manual (sync, conexão de
loja) mexe em dado real. Tenha cuidado ao rodar rotas de sync localmente.

## Deploy (Lovable)

Este projeto foi construído com [Lovable](https://lovable.dev) e está
publicado em **dreamice.shop**.

- Push na branch `main` sincroniza o código pro Lovable, mas **o deploy só
  vai ao ar depois de publicar manualmente no editor do Lovable** — um
  push sozinho não é suficiente.
- O Lovable **não aplica migrações do Supabase automaticamente**: toda
  `.sql` nova em `supabase/migrations/` precisa ser rodada à mão no SQL
  Editor do Supabase antes (ou logo depois) de publicar.
- Edite também diretamente pelo [editor do Lovable](https://lovable.dev/projects/73ef96e5-75af-4341-beba-ebd8e4a66fc1)
  se preferir prompt em vez de código — as mudanças de lá chegam aqui como
  commit normal.

## Estrutura de pastas

```
src/
├── routes/
│   ├── _authenticated/*.lazy.tsx   # telas (uma por rota do menu)
│   ├── api/public/shopee/*.ts      # rotas chamadas pelos crons + webhook (sem JWT)
│   ├── api/shopee/auth-url.ts      # rota antiga de teste via curl
│   └── api/chat.ts                 # endpoint do DreamAI
├── lib/
│   ├── shopee.server.ts            # HMAC + chamadas à API da Shopee (fonte única)
│   ├── shopee-credenciais.server.ts# resolve credencial por loja (com fallback global)
│   ├── loja-conexao.server.ts      # valida/renova token de uma loja específica
│   ├── lojas.server.ts             # lojas ativas, loja padrão
│   ├── *.functions.ts              # server functions chamadas pelo frontend (useServerFn)
│   └── *.server.ts                 # demais regras de negócio (server-only)
├── components/                     # UI (shadcn/ui + app-sidebar etc.)
└── integrations/supabase/          # clients (browser e admin/service_role)

supabase/migrations/                # todo o histórico de schema, aplicado manualmente
scripts/                            # scripts avulsos (ex.: aplicação de emergência em produção)
```
