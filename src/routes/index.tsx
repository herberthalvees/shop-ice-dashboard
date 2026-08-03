import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dream Ice — Redirecionando" },
      { name: "description", content: "Acesso ao painel privado Dream Ice para gestão da loja Shopee." },
      { property: "og:title", content: "Dream Ice — Redirecionando" },
      { property: "og:description", content: "Acesso ao painel privado Dream Ice para gestão da loja Shopee." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Carregando…");
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session?.user) navigate({ to: "/dashboard", replace: true });
      else navigate({ to: "/auth", replace: true });
      setMsg("");
    });
    return () => { mounted = false; };
  }, [navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      <div className="flex items-center gap-3 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        {msg}
      </div>
    </div>
  );
}
