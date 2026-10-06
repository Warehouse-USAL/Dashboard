import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Config SEPARADA de vitest.config.ts, para los tests de contrato contra el
// backend real (src/lib/api.backend.test.ts). No usan MSW a propósito: acá la
// idea es que el fetch salga de verdad. Por eso:
//   - environment "node", no "jsdom" — no hay nada que renderizar.
//   - sin setupFiles: el setup normal arranca el servidor MSW, que es
//     exactamente lo que NO queremos activo en estos tests.
//   - `include` apunta solo a *.backend.test.ts, para que `npm test` (con
//     MSW) nunca los toque y viceversa.
//
// Corren con `npm run test:backend`, nunca en CI (ver ci.yml): el backend
// vive en la LAN y los runners de GitHub Actions no llegan a esa IP.

// Vitest, a diferencia de Vite, NO carga .env.local cuando el modo es "test"
// (es un comportamiento documentado de Vite: .env.local se salta a propósito
// en modo test, para que correr los tests no dependa de lo que cada persona
// tenga en su máquina). Como acá SÍ queremos justo eso — usar las variables
// locales de cada dev (BACKEND_URL, VITE_ADMIN_EMAIL, VITE_ADMIN_PASSWORD) —
// se leen a mano en vez de depender de esa carga automática. `.env.local` ya
// está en .gitignore; este archivo no lo modifica, sólo lo lee si existe.
function loadDotEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    // No pisa una variable que ya vino del shell (p. ej. en un futuro runner
    // dedicado que las exporte en vez de leer el archivo).
    process.env[key] ??= rawValue.trim();
  }
}
loadDotEnvLocal();

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.backend.test.ts"],
  },
});
