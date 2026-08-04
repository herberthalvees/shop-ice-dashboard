import { createFileRoute, Link } from "@tanstack/react-router";
import markUrl from "@/assets/dreamice-mark.png";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Dream Ice" },
      { name: "description", content: "Como o Dream Ice coleta, usa e protege os dados das lojas conectadas na Shopee e no TikTok Shop." },
      { property: "og:title", content: "Política de Privacidade — Dream Ice" },
      { property: "og:description", content: "Como o Dream Ice trata os dados das lojas conectadas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <Link to="/" className="mb-10 flex items-center gap-3">
          <img src={markUrl} alt="Dream Ice" className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight">Dream Ice</span>
        </Link>

        <h1 className="text-3xl font-bold tracking-tight">Política de Privacidade</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: agosto de 2026</p>

        <div className="mt-8 space-y-7 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-base font-semibold text-foreground">1. Quem somos</h2>
            <p className="mt-2">
              Dream Ice é um painel privado de gestão usado pelo próprio lojista para acompanhar suas
              vendas na Shopee e no TikTok Shop. Não é um serviço aberto ao público e não há venda de
              dados a terceiros.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground">2. Dados que tratamos</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Dados da conta do painel: e-mail e credenciais de autenticação.</li>
              <li>Dados da loja autorizada: pedidos, itens, valores, taxas, repasses financeiros, produtos e estoque.</li>
              <li>Dados de campanhas de anúncios: investimento e desempenho.</li>
              <li>Mensagens de atendimento trocadas na própria loja, incluindo nome de exibição do comprador.</li>
              <li>Tokens de acesso emitidos pelos marketplaces após a autorização do titular.</li>
            </ul>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground">3. Para que usamos</h2>
            <p className="mt-2">
              Exclusivamente para exibir relatórios, indicadores de lucro, alertas de novas vendas e
              novas mensagens, e para responder clientes pelo canal de atendimento da própria loja.
              Não usamos os dados para publicidade nem para criação de perfis de terceiros.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground">4. Como protegemos</h2>
            <p className="mt-2">
              Tráfego criptografado em HTTPS, acesso somente para usuários autenticados, isolamento por
              políticas de acesso no banco de dados e chaves de integração armazenadas como segredos no
              servidor, nunca no navegador.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground">5. Compartilhamento</h2>
            <p className="mt-2">
              Compartilhamos dados apenas com os provedores de infraestrutura necessários para operar o
              painel (hospedagem, banco de dados, envio de notificações) e com as próprias APIs dos
              marketplaces. Nunca com anunciantes ou compradores de dados.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground">6. Retenção e exclusão</h2>
            <p className="mt-2">
              Os dados ficam armazenados enquanto a loja permanece conectada. Ao revogar a autorização,
              a sincronização é interrompida e os dados podem ser excluídos a pedido do titular.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground">7. Seus direitos</h2>
            <p className="mt-2">
              Você pode solicitar acesso, correção ou exclusão dos dados tratados pelo painel, além de
              revogar a autorização de acesso às lojas em qualquer momento.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground">8. Contato</h2>
            <p className="mt-2">
              <a className="text-primary underline" href="mailto:contato@dreamice.shop">contato@dreamice.shop</a>
            </p>
          </section>
        </div>

        <div className="mt-12 text-sm">
          <Link to="/termos" className="text-primary underline">Termos de Serviço</Link>
        </div>
      </div>
    </main>
  );
}
