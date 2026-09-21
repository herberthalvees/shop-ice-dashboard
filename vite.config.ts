// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // NÃO desabilite nodeCompat: sem ele o runtime perde AsyncLocalStorage e
  // TODAS as server functions quebram em produção com
  // "No Start context found in AsyncLocalStorage" (erro 500).
  vite: {
    server: {
      // Libera acesso via túneis ngrok (dev local através de um domínio
      // público, necessário para testar o OAuth da Shopee, que exige um
      // domínio de retorno registrado — localhost não serve).
      allowedHosts: [".ngrok-free.app", ".ngrok-free.dev", ".ngrok.io", ".ngrok.app"],
    },
  },
});
