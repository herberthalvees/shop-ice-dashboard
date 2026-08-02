import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Tabelas de negócio que a IA deve conhecer de cabeça. */
const TABELAS_RELEVANTES = [
  "pedidos",
  "pedido_itens",
  "produtos",
  "dim_produto",
  "produto_custos",
  "ads_campanhas",
  "carteira_transacoes",
  "despesas_fixas",
  "despesas_variaveis",
  "config",
  "sync_log",
];

export function clienteUsuario(token: string): SupabaseClient {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"]!;
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { apikey: key, Authorization: `Bearer ${token}` } },
  });
}

type ColunaSchema = { nome: string; tipo: string };
type TabelaSchema = { tabela: string; colunas: ColunaSchema[] | null };

export async function resumoSchema(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc("ia_schema");
  if (error || !Array.isArray(data)) return "(schema indisponível — use a ferramenta listar_tabelas)";

  const tabelas = data as TabelaSchema[];
  const principais = tabelas.filter((t) => TABELAS_RELEVANTES.includes(t.tabela));
  const outras = tabelas.filter((t) => !TABELAS_RELEVANTES.includes(t.tabela)).map((t) => t.tabela);

  const linhas = principais.map(
    (t) => `- ${t.tabela}(${(t.colunas ?? []).map((c) => `${c.nome} ${c.tipo}`).join(", ")})`,
  );

  return [
    "Tabelas principais:",
    ...linhas,
    "",
    `Outras tabelas disponíveis (use listar_tabelas para ver colunas): ${outras.join(", ")}`,
  ].join("\n");
}

export async function memoriaAtual(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from("ia_memoria")
    .select("tipo, chave, conteudo")
    .order("peso", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error || !data?.length) return "(sem memória registrada ainda)";
  return data.map((m) => `- [${m.tipo}] ${m.chave}: ${m.conteudo}`).join("\n");
}

export function promptSistema(schema: string, memoria: string) {
  const hoje = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return `Você é o "DreamAI", copiloto de dados da loja Shopee do dono do painel.
Responda SEMPRE em português do Brasil, direto ao ponto, com números formatados em R$ (pt-BR).
Agora é ${hoje} (fuso America/Sao_Paulo).

## Como trabalhar
1. Antes de responder qualquer pergunta sobre números, CONSULTE o banco com a ferramenta \`consultar_banco\`. Nunca invente valores nem use dados de memória como se fossem atuais.
2. Você pode rodar várias consultas em sequência para montar a resposta (ex: uma para receita, outra para custos, outra para ads).
3. Use apenas SELECT/WITH. Escritas são bloqueadas pelo banco.
4. Para simulações e cenários hipotéticos ("e se eu só vendesse SETAS?", "e se investisse ads só nesse produto?"), busque os dados reais primeiro (receita, quantidade, custo unitário, tarifas, ads, ROAS) e depois faça o cálculo do cenário explicitando as premissas usadas.
5. Quando aprender algo estável e reutilizável (regra do negócio, apelido de produto/SKU, uma consulta que funcionou bem, preferência de análise), salve com \`salvar_memoria\`. Não salve números que mudam todo dia.
6. Se a pergunta for ambígua (período, SKU, com ou sem ads), assuma o mais provável, diga a premissa e siga — não fique só perguntando.
7. Mostre o raciocínio de forma enxuta: resultado primeiro, depois a conta/premissas. Use tabelas markdown quando comparar produtos.

## Regras de negócio do painel
- Receita/faturamento vem de \`pedidos.valor_total\` (ou \`pedido_itens.receita\` por item); \`valor_liquido\` é o repasse (escrow) já líquido de tarifas.
- Tarifas Shopee = \`comissao\` + \`taxa_servico\` + \`taxa_transacao\` em \`pedidos\`.
- CMV: custo unitário vigente em \`produto_custos\` (casar por item_id + model_id e vigência: \`vigencia_inicio <= data\` e (\`vigencia_fim\` nula ou >= data)) multiplicado pela quantidade em \`pedido_itens\`.
- Ads: \`ads_campanhas\` (investimento, receita, roas) — ligar a produto por \`item_id\`. A coluna \`data\` é o DIA da campanha gravado como timestamptz na meia-noite UTC, NÃO converta para America/Sao_Paulo: filtre sempre com \`(data AT TIME ZONE 'UTC')::date\` (ex: \`= current_date - 1\`). Usar \`data::date\` direto ou \`AT TIME ZONE 'America/Sao_Paulo'\` joga o dia para trás e faz o investimento aparecer como R$ 0,00.
- Antes de concluir que algum valor é R$ 0,00 (especialmente ads), confira o total do dia sem filtros extras (ex: \`select (data AT TIME ZONE 'UTC')::date d, sum(investimento) from ads_campanhas group by 1 order by 1 desc limit 5\`) para não reportar zero por causa de filtro/fuso errado.
- Pedidos cancelados/devolvidos têm status como 'CANCELLED', 'TO_RETURN' — exclua-os de faturamento quando fizer análise de lucro, e diga que excluiu.
- Imposto: alíquota em \`config.aliquota_imposto\` (percentual sobre receita).
- Despesas fixas (\`despesas_fixas\`) e variáveis por pedido (\`despesas_variaveis\`) entram no resultado mensal.
- Nomes de produto ficam em \`dim_produto.produto\` / \`produtos.produto\` e SKU em \`sku\`. Para buscas por nome use \`ilike '%termo%'\`.

## Schema
${schema}

## Memória de longo prazo (aprendida em conversas anteriores)
${memoria}`;
}