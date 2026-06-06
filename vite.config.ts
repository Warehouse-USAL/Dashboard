// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8090";
const backendWsUrl = backendUrl.replace(/^http/, "ws");

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      proxy: {
        "/auth": { target: backendUrl, changeOrigin: true },
        "/vehicles": { target: backendUrl, changeOrigin: true },
        "/orders": { target: backendUrl, changeOrigin: true },
        "/products": { target: backendUrl, changeOrigin: true },
        "/ws": { target: backendWsUrl, ws: true, changeOrigin: true },
      },
    },
  },
});
