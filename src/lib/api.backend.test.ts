import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Tests de CONTRATO contra el backend real — a propósito sin MSW (ver
 * vitest.backend.config.ts). No verifican valores de negocio (cuántas
 * órdenes hay, qué batería tiene un rover): esos cambian todo el tiempo y no
 * son parte de ningún contrato. Lo que verifican es la FORMA de lo que
 * contesta el backend — que siga teniendo los campos que api.ts espera. Si
 * el backend real cambia un nombre de campo o agrega un estado nuevo, estos
 * son los tests que se enteran; los que usan MSW (api.test.ts) no pueden,
 * porque le preguntan a un actor que escribimos nosotros, no al backend.
 *
 * Corren con `npm run test:backend`, nunca con `npm test` ni en CI.
 */

const BACKEND_URL = process.env.BACKEND_URL;
const ADMIN_EMAIL = process.env.VITE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.VITE_ADMIN_PASSWORD;

function isValidUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// Si BACKEND_URL existe pero está mal escrita (por ejemplo con un ";" al
// final), sin este chequeo cada test falla con un error largo de fetch que no
// dice qué variable está mal. Por eso se valida una vez, acá, y se saltean
// los demás casos en vez de que fallen todos con ese error.
const backendUrlIsValid = isValidUrl(BACKEND_URL);
const hasBackend = backendUrlIsValid;
const hasAdminCreds = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

if (!BACKEND_URL) {
  console.warn(
    "[test:backend] Falta BACKEND_URL (.env.local) — se saltean todos los casos de este archivo.",
  );
} else if (!backendUrlIsValid) {
  console.warn(
    "[test:backend] BACKEND_URL no es una URL válida (revisá .env.local) — se saltean los casos.",
  );
} else if (!hasAdminCreds) {
  console.warn(
    "[test:backend] Falta VITE_ADMIN_EMAIL/VITE_ADMIN_PASSWORD (.env.local) — se saltean los " +
      "casos que necesitan sesión (todos menos el de login inválido).",
  );
}

/**
 * api.ts lee VITE_API_URL una sola vez, al cargar el módulo (BASE_URL es una
 * const de nivel de archivo) — mismo motivo por el que "getWsUrl con
 * BASE_URL" en api.test.ts reimporta el módulo en vez de cambiar la
 * variable a mitad de camino. Acá hace falta lo mismo: apuntar VITE_API_URL
 * al backend real ANTES de importar api.ts, si no se siguen mandando
 * requests a rutas relativas (pensadas para el proxy de Vite, que acá no
 * existe).
 */
async function importApiAgainstRealBackend() {
  vi.stubEnv("VITE_API_URL", BACKEND_URL);
  vi.resetModules();
  return import("./api");
}

/**
 * Chequeo de conectividad: cualquier respuesta HTTP (200, 401, 404, lo que
 * sea) significa que el backend está ahí. Solo falla si no hay respuesta en
 * absoluto — red caída, VPN apagada, máquina apagada, o timeout.
 */
async function verificarConectividad(): Promise<void> {
  try {
    await fetch(BACKEND_URL!, { signal: AbortSignal.timeout(5_000) });
  } catch (err) {
    throw new Error(
      `no hay respuesta de ${BACKEND_URL} (¿estás en la red del backend o con VPN?). ` +
        `Detalle: ${(err as Error).message}`,
    );
  }
}

/**
 * Envuelve un paso del test para que, si falla, el mensaje diga QUÉ intentó
 * hacer y contra QUÉ dirección, además del error original. No intenta listar
 * todas las causas posibles: cubre cualquier fallo con el mismo formato.
 */
async function paso<T>(descripcion: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    throw new Error(`${descripcion} contra ${BACKEND_URL} falló: ${detalle}`, { cause: err });
  }
}

/**
 * api.ts getOrders() y getVehicles() NO lanzan error cuando el backend falla:
 * capturan el error, lo loguean con "→ mock", y devuelven datos de fixture. Un
 * test de forma que sólo mira el resultado pasaría en verde con datos falsos.
 * Este chequeo mira el log de ese fallback y falla si ocurrió.
 */
function fallosAMock(spy: { mock: { calls: unknown[][] } }): unknown[][] {
  return spy.mock.calls.filter((args) => String(args[0]).includes("→ mock"));
}

// Roles reales del backend (domain/UserRole.java) — copiado de api.ts, no
// inventado, para no afirmar "cualquier string sirve".
const KNOWN_ROLES = [
  "SUPERADMIN",
  "ADMIN_SYSTEM",
  "ADMIN_WAREHOUSE",
  "ADMIN_SALES",
  "PROVIDER",
  "DISPATCHER",
  "OPERATOR",
  "DASHBOARD",
];

describe("Configuración del entorno", () => {
  // Este corre aunque BACKEND_URL esté mal: es justo el caso que queremos que
  // quede explícito en el reporte. Si no hay BACKEND_URL del todo, se saltea
  // (la advertencia de arriba ya lo dice).
  it.skipIf(!BACKEND_URL)("BACKEND_URL es una URL válida", () => {
    expect(
      backendUrlIsValid,
      `BACKEND_URL no es una URL válida (revisá .env.local): "${BACKEND_URL}"`,
    ).toBe(true);
  });
});

describe.skipIf(!hasBackend)("Contrato con el backend real", () => {
  // Una sola verificación de conectividad para toda la suite. Si falla, el
  // mensaje dice el problema de red una vez, en vez de cada test haciendo su
  // propio timeout.
  beforeAll(async () => {
    await verificarConectividad();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("login con credenciales inválidas es rechazado, igual que espera login.tsx", async () => {
    const { login } = await importApiAgainstRealBackend();

    // No se fija el status exacto (401 es lo esperable, pero no queremos que
    // el test rompa solo porque el backend eligiera 400/403 para esto) — lo
    // que importa es que login() falle de una forma que login.tsx sepa
    // atrapar: cualquier error lanzado por la función.
    await expect(
      paso("login inválido", () => login("no-existe@test.local", "contraseña-incorrecta")),
    ).rejects.toThrow(/Login failed: \d+/);
  });

  it.skipIf(!hasAdminCreds)(
    "login con credenciales reales guarda un token y un rol conocido",
    async () => {
      const { login, getStoredToken, getStoredRole } = await importApiAgainstRealBackend();

      await paso("login con VITE_ADMIN_EMAIL", () => login(ADMIN_EMAIL!, ADMIN_PASSWORD!));

      expect(getStoredToken()).toBeTruthy();
      // No afirma CUÁL rol — sólo que sea uno de los que el backend puede
      // mandar. Si el día de mañana agrega un rol nuevo, mejor que este test
      // avise a que se lo trague en silencio.
      expect(KNOWN_ROLES).toContain(getStoredRole());
    },
  );

  it.skipIf(!hasAdminCreds)(
    "GET /orders devuelve una forma que mapOrder puede procesar sin romperse",
    async () => {
      const { login, getOrders } = await importApiAgainstRealBackend();
      await paso("login con VITE_ADMIN_EMAIL", () => login(ADMIN_EMAIL!, ADMIN_PASSWORD!));

      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const orders = await getOrders(undefined, undefined, 10);

      // Primero el chequeo de fallback: si getOrders cayó a mock, lo que sigue
      // no está verificando el backend real.
      expect(
        fallosAMock(spy),
        "getOrders cayó a datos mock: el backend no respondió bien a /orders",
      ).toHaveLength(0);

      // Sin garantías de que haya datos cargados hoy — si no hay órdenes,
      // no hay contrato que romper todavía, no es una falla de este test.
      if (orders.length === 0) return;

      for (const order of orders) {
        expect(order.id).toEqual(expect.any(String));
        expect(order.product).toEqual(expect.any(String));
        expect(order.qty).toEqual(expect.any(Number));
        expect(order.rover).toEqual(expect.any(String));
        // Listados explícitos, no "es un string": si mapOrderPriority o el
        // traductor de estados no reconociera un valor nuevo del backend,
        // igual devolvería un string cualquiera y un chequeo más flojo no
        // lo notaría.
        expect(["urgente", "alta", "media", "baja"]).toContain(order.priority);
        expect(["en espera", "en proceso", "completada", "cancelada"]).toContain(order.state);
      }
    },
  );

  it.skipIf(!hasAdminCreds)(
    "GET /vehicles devuelve una forma que mapVehicle puede procesar sin romperse",
    async () => {
      const { login, getVehicles } = await importApiAgainstRealBackend();
      await paso("login con VITE_ADMIN_EMAIL", () => login(ADMIN_EMAIL!, ADMIN_PASSWORD!));

      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const vehicles = await getVehicles(10);

      expect(
        fallosAMock(spy),
        "getVehicles cayó a datos mock: el backend no respondió bien a /vehicles",
      ).toHaveLength(0);

      if (vehicles.length === 0) return;

      for (const vehicle of vehicles) {
        expect(vehicle.id).toEqual(expect.any(String));
        expect(["busy", "idle", "error", "offline"]).toContain(vehicle.state);
        expect(vehicle.battery).toEqual(expect.any(Number));
        expect(vehicle.x).toEqual(expect.any(Number));
        expect(vehicle.y).toEqual(expect.any(Number));
      }
    },
  );
});
