import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import markUrl from "@/assets/dreamice-mark.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Dream Ice" },
      { name: "description", content: "Entre ou crie sua conta para acessar o painel privado Dream Ice." },
      { property: "og:title", content: "Entrar — Dream Ice" },
      { property: "og:description", content: "Entre ou crie sua conta para acessar o painel privado Dream Ice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "cadastro" | "recuperar">("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível entrar", { description: error.message });
      return;
    }
    toast.success("Bem-vindo(a) de volta");
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (senha.length < 8) {
      toast.error("Senha muito curta", { description: "Use pelo menos 8 caracteres." });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível criar a conta", { description: error.message });
      return;
    }
    if (data.session) {
      toast.success("Conta criada");
      navigate({ to: "/dashboard", replace: true });
    } else {
      toast.success("Conta criada", { description: "Verifique seu e-mail para confirmar." });
      setMode("login");
    }
  }

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error("Erro ao enviar e-mail", { description: error.message });
      return;
    }
    toast.success("E-mail enviado", { description: "Verifique sua caixa de entrada." });
    setMode("login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center">
          <img src={markUrl} alt="Dream Ice" className="h-20 w-auto object-contain drop-shadow-[0_0_18px_rgba(255,140,40,0.45)]" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              {mode === "login" ? "Entrar no painel" : mode === "cadastro" ? "Criar conta" : "Recuperar senha"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Acesse seu painel Dream Ice."
                : mode === "cadastro"
                ? "Crie sua conta para acessar o painel."
                : "Enviaremos um link para redefinir sua senha."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={
                mode === "login" ? handleLogin : mode === "cadastro" ? handleSignup : handleRecover
              }
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {mode !== "recuperar" && (
                <div className="space-y-2">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha"
                    type="password"
                    autoComplete={mode === "cadastro" ? "new-password" : "current-password"}
                    required
                    minLength={mode === "cadastro" ? 8 : undefined}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "login" ? "Entrar" : mode === "cadastro" ? "Criar conta" : "Enviar link"}
              </Button>
              <div className="flex flex-col gap-2 text-center text-sm text-muted-foreground">
                {mode === "login" && (
                  <>
                    <button type="button" onClick={() => setMode("cadastro")} className="hover:text-foreground transition-colors">
                      Não tem conta? Criar agora
                    </button>
                    <button type="button" onClick={() => setMode("recuperar")} className="hover:text-foreground transition-colors">
                      Esqueci minha senha
                    </button>
                  </>
                )}
                {mode !== "login" && (
                  <button type="button" onClick={() => setMode("login")} className="hover:text-foreground transition-colors">
                    Voltar para o login
                  </button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Acesso privado · uso pessoal
        </p>
      </div>
    </div>
  );
}