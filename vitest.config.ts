import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // jsdom (no "node") porque los tests de integración renderizan componentes
    // React de verdad y necesitan un DOM simulado.
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
