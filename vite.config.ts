// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8080";
const backendWsUrl = backendUrl.replace(/^http/, "ws");

// We deploy as a STATIC SPA behind nginx (served under the /dashboard/ path prefix
// by the wh-autodeploys Caddy proxy), NOT as a Cloudflare Worker. So:
//   - cloudflare: false      -> don't build the Workers SSR bundle (unused here)
//   - tanstackStart.spa      -> prerender a real, mountable index.html shell. Without
//                               this we hand-wrote an index.html that loaded the Start
//                               client entry expecting SSR/hydration state that wasn't
//                               there -> "Invariant failed" / blank page.
//   - vite.base '/dashboard/'-> emitted asset URLs become /dashboard/assets/... so they
//                               resolve through the Caddy /dashboard/* route.
export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    spa: { enabled: true },
    server: { entry: "server" },
  },
  vite: {
    base: "/dashboard/",
    server: {
      proxy: {
        "/auth": { target: backendUrl, changeOrigin: true },
        "/vehicles": { target: backendUrl, changeOrigin: true },
        "/orders": { target: backendUrl, changeOrigin: true },
        "/products": { target: backendUrl, changeOrigin: true },
        "/warehouse": { target: backendUrl, changeOrigin: true },
        "/ws": { target: backendWsUrl, ws: true, changeOrigin: true },
      },
    },
  },
});
