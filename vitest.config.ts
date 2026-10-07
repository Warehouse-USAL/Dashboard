import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // jsdom (no "node") porque los tests de integración renderizan componentes
    // React de verdad y necesitan un DOM simulado.
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // `npm run test:coverage`. Sin `include`, Vitest sólo reporta los archivos
    // que algún test llega a importar: las pantallas y hooks sin ningún test
    // no aparecerían, y el "All files" se vería mucho mejor de lo que es (~82%
    // en vez de ~35%). Con `include` se mide todo el código propio. Se excluye
    // lo que no tiene sentido medir: los componentes shadcn generados, el
    // árbol de rutas autogenerado y la infraestructura de tests.
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/routeTree.gen.ts",
        "src/components/ui/**",
      ],
    },
  },
});
