import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Bell,
  Settings,
  LogOut,
  Calculator,
  Wallet,
  FileSpreadsheet,
  Bot,
  Percent,
  MessageSquare,
  Boxes,
  Star,
  Megaphone,
  Store,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import logoAsset from "@/assets/dreamice-logo.png.asset.json";
import markUrl from "@/assets/dreamice-mark.png";

const grupos = [
  {
    label: "Visão geral",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "DreamAI", url: "/ia", icon: Bot },
    ],
  },
  {
    label: "Operação",
    items: [
      { title: "Pedidos", url: "/pedidos", icon: ShoppingBag },
      { title: "Produtos", url: "/produtos", icon: Package },
      { title: "Estoque", url: "/estoque", icon: Boxes },
      { title: "Chat", url: "/chat", icon: MessageSquare },
      { title: "Avaliações", url: "/avaliacoes", icon: Star },
      { title: "Pós-venda", url: "/pos-venda", icon: Megaphone },
      { title: "Precificação", url: "/precificacao", icon: Calculator },
      { title: "Calculadora", url: "/calculadora", icon: Percent },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { title: "Financeiro", url: "/financeiro", icon: Wallet },
      { title: "DRE", url: "/dre", icon: FileSpreadsheet },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Lojas", url: "/lojas", icon: Store },
      { title: "Notificações", url: "/notificacoes", icon: Bell },
      { title: "Configurações", url: "/configuracoes", icon: Settings },
    ],
  },
] as const;

const tile3d =
  "relative flex size-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-gradient-to-br from-white/12 to-black/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_2px_5px_rgba(0,0,0,0.45)] transition-all duration-200 group-hover/menu-item:-translate-y-[1px]";

const botaoMenu =
  "h-9 gap-2.5 rounded-lg group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Sidebar
      collapsible="icon"
      className="[&_[data-sidebar=sidebar]]:bg-gradient-to-b [&_[data-sidebar=sidebar]]:from-sidebar [&_[data-sidebar=sidebar]]:to-background"
    >
      <SidebarHeader className="border-b border-sidebar-border/60 group-data-[collapsible=icon]:px-0">
        <Link
          to="/dashboard"
          className="flex items-center gap-2.5 px-1 py-1.5 transition-opacity hover:opacity-90 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-gradient-to-br from-primary/25 via-background to-black/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_6px_14px_-6px_rgba(0,0,0,0.9)] group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:rounded-lg">
            <img
              src={markUrl}
              alt="Dream Ice"
              width={36}
              height={36}
              className="size-6 object-contain drop-shadow-[0_0_6px_rgba(255,140,40,0.55)] group-data-[collapsible=icon]:size-5"
            />
          </span>
          {!collapsed && (
            <img src={logoAsset.url} alt="Dream Ice Shop" className="h-8 w-auto object-contain" />
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        {grupos.map((grupo) => (
          <SidebarGroup key={grupo.label}>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
              {grupo.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {grupo.items.map((item) => {
                  const active = pathname === item.url || pathname.startsWith(item.url + "/");
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className={
                          botaoMenu +
                          " data-[active=true]:bg-gradient-to-r data-[active=true]:from-primary/20 data-[active=true]:to-transparent data-[active=true]:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                        }
                      >
                        <Link
                          to={item.url}
                          className="group-data-[collapsible=icon]:justify-center"
                        >
                          <span
                            className={
                              tile3d +
                              (active
                                ? " border-primary/40 from-primary/35 to-primary/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_3px_8px_rgba(0,0,0,0.5)]"
                                : "")
                            }
                          >
                            <item.icon
                              className={
                                "size-4 " +
                                (active
                                  ? "text-primary drop-shadow-[0_0_5px_rgba(255,140,40,0.7)]"
                                  : "text-sidebar-foreground/70")
                              }
                            />
                          </span>
                          <span className="truncate font-medium group-data-[collapsible=icon]:hidden">
                            {item.title}
                          </span>
                          {active && (
                            <span className="ml-auto h-4 w-1 rounded-full bg-primary shadow-[0_0_8px_rgba(255,140,40,0.8)] group-data-[collapsible=icon]:hidden" />
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} tooltip="Sair" className={botaoMenu}>
              <span className={tile3d}>
                <LogOut className="size-4 text-sidebar-foreground/70" />
              </span>
              <span className="font-medium group-data-[collapsible=icon]:hidden">Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
