# Pós-venda — Fase 1

Nova aba **Pós-venda** (`/pos-venda`) para criar campanhas de mensagem com cupom, enviadas pelo chat da Shopee para públicos filtrados de quem já comprou.

## Como vai funcionar

**1. Contatos alcançáveis**
A API só deixa mandar mensagem para compradores com `to_id` conhecido (conversa existente). Então um job novo varre a lista de conversas da Shopee (com paginação, não só as 25 primeiras) e guarda cada contato: `to_id`, nome/usuário, `conversation_id`, última interação. Esse cadastro é ligado aos pedidos pelo usuário do comprador, e é ele que define o alcance real de cada campanha. A tela mostra sempre "X clientes no filtro · Y alcançáveis por chat".

**2. Construtor de público**
Filtros combináveis, com contagem e amostra ao vivo antes de salvar:
- Período do pedido (atalhos 7/30/90 dias + intervalo livre)
- Nº de pedidos (mín./máx.) e total gasto (LTV mínimo)
- Ticket do último pedido
- Produto/SKU comprado
- Só pedidos válidos (exclui `UNPAID`, `CANCELLED`, `TO_RETURN`)
- Avaliação: avaliou 4–5★ / avaliou ≤3★ / nunca avaliou (via `avaliacoes.order_sn` → pedido → comprador)
- Inatividade: sem comprar há X dias (winback)
- Exclusões automáticas: já recebeu esta campanha, recebeu qualquer campanha nos últimos N dias, ou está na lista de opt-out

**3. Cupom**
Cadastro do código (código, desconto, validade, pedido mínimo, observação). O painel não cria o cupom na Shopee — você cria no Seller Center e registra aqui para usar na mensagem e medir a distribuição.

**4. Mensagem**
- Até 5 variações de texto por campanha, sorteadas por destinatário (evita repetição, igual às avaliações)
- Variáveis: `{comprador}`, `{cupom}`, `{desconto}`, `{validade}`, `{produto}`
- Prévia renderizada com um cliente real do público
- Botão opcional "melhorar com IA", com o custo registrado em `ia_uso`

**5. Envio controlado**
- Fila por destinatário, com estados: pendente / enviado / erro / pulado
- Cron a cada 5 min processa um lote pequeno (ritmo configurável, ex.: 20 msgs/rodada) — evita parecer spam
- Limite diário por campanha e regra global de "no máximo 1 mensagem promocional por cliente a cada 30 dias"
- Agendar, pausar, retomar, cancelar
- Reaproveita `enviarMensagem` (mesmo caminho do chat atual, já com renovação de token e log em `chat_envios`)

**6. Resultados**
Por campanha: enviados, erros, respostas recebidas no chat, e pedidos feitos por quem recebeu nos 14 dias seguintes (receita atribuída). Mais uma sub-aba **Opt-out** para excluir clientes manualmente.

## Telas
- **Campanhas** — lista com status, público, enviados/total, receita atribuída
- **Nova campanha** — passos: público → cupom → mensagem → ritmo/agendamento → revisar e ativar
- **Cupons** — cadastro dos códigos
- **Contatos & Opt-out** — cobertura de contatos alcançáveis e bloqueios

## Detalhes técnicos
- Tabelas novas: `pv_contatos`, `pv_cupons`, `pv_campanhas` (filtros em `jsonb`, variações de texto, ritmo, limites), `pv_envios` (fila + resultado), `pv_optout`. RLS igual ao resto do painel (owner/`service_role`) e `GRANT`s na mesma migração.
- RPC `pv_publico_preview(filtros jsonb)` para contagem/amostra e `pv_materializar_publico(campanha_id)` para gerar a fila.
- Server fns em `src/lib/pos-venda.functions.ts` + `pos-venda.server.ts`; sincronização de contatos e processamento da fila como rotas `api/public/*` protegidas por `CRON_SECRET`, agendadas no `pg_cron`.
- Nada do fluxo atual de chat, avaliações ou dashboard é alterado.

## Fora desta fase
Criação automática de cupom na Shopee (a API de vouchers não está integrada), envio por e-mail/telefone (não existe na API) e campanhas recorrentes automáticas — ficam para a Fase 2.
