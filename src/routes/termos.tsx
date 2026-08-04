import { createFileRoute, Link } from "@tanstack/react-router";
import markUrl from "@/assets/dreamice-mark.png";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Serviço — Dream Ice" },
      { name: "description", content: "Termos de Serviço do Dream Ice, painel privado de gestão de vendas para Shopee e TikTok Shop." },
      { property: "og:title", content: "Termos de Serviço — Dream Ice" },
      { property: "og:description", content: "Termos de Serviço do painel Dream Ice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermosPage,
});

function TermosPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <Link to="/" className="mb-10 flex items-center gap-3">
          <img src={markUrl} alt="Dream Ice" className="h-9 w-9" />
          <span className="text-lg font-semibold tracking-tight">Dream Ice</span>
        </Link>

        <h1 className="text-3xl font-bold tracking-tight">Termos de Serviço</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última atualização: agosto de 2026</p>

        <div className="mt-8 space-y-7 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-base font-semibold text-foreground">1. Sobre o serviço</h2>
            <p className="mt-2">
              Dream Ice é um painel web privado de uso interno que centraliza dados de vendas, produtos,
              finanças e atendimento das lojas do próprio operador nos marketplaces Shopee e TikTok Shop.
              O acesso é restrito a usuários autenticados e autorizados pelo proprietário do painel.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground">2. Uso das APIs dos marketplaces</h2>
            <p className="mt-2">
              O painel se conecta às APIs oficiais dos marketplaces apenas depois que o titular da loja
              autoriza o acesso. Os dados obtidos são usados exclusivamente para exibir relatórios,
              indicadores e mensagens da própria loja dentro do painel. Não revendemos, não compartilhamos
              e não usamos esses dados para publicidade de terceiros.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground">3. Responsabilidades do usuário</h2>
            <p className="mt-2">
              O usuário é responsável por manter suas credenciais em segurança, por usar o painel em
              conformidade com as políticas dos marketplaces e com a legislação aplicável, e por revisar
              os dados antes de tomar decisões comerciais.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground">4. Disponibilidade</h2>
            <p className="mt-2">
              O serviço é fornecido "como está". Podem ocorrer interrupções por manutenção ou por
              indisponibilidade das APIs dos marketplaces. Números exibidos podem sofrer ajustes
              conforme a atualização dos dados na origem.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground">5. Encerramento e revogação</h2>
            <p className="mt-2">
              A autorização de acesso às lojas pode ser revogada em qualquer momento pelo titular, tanto
              no painel de configurações do Dream Ice quanto no próprio marketplace. Após a revogação,
              paramos de sincronizar novos dados.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-foreground">6. Contato</h2>
            <p className="mt-2">
              Dúvidas sobre estes termos: <a className="text-primary underline" href="mailto:contato@dreamice.shop">contato@dreamice.shop</a>.
            </p>
          </section>
        </div>

        <div className="mt-12 text-sm">
          <Link to="/privacidade" className="text-primary underline">Política de Privacidade</Link>
        </div>
      </div>
    </main>
  );
}
