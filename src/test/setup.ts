import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { beforeAll, afterEach, afterAll, vi } from "vitest";
import { server } from "./msw/server";
import { setStoredToken } from "@/lib/api";

// ─── Polyfills que jsdom no trae ──────────────────────────────────────────────

// Recharts (<ResponsiveContainer>) instancia ResizeObserver sin chequear si
// existe, y jsdom no lo implementa -> ReferenceError al renderizar cualquier
// panel con gráficos.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// Radix (Popover de filtros/período) usa estas APIs de puntero y matchMedia,
// que jsdom tampoco implementa.
globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
})) as unknown as typeof globalThis.matchMedia;

Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

// ─── MSW ──────────────────────────────────────────────────────────────────────

beforeAll(() => {
  // apiFetch() exige un token: sin esto getToken() lanza, getOrders() atrapa el
  // error y devuelve los datos mock locales -> la request nunca llega a MSW y el
  // test pasaría/fallaría por el motivo equivocado.
  setStoredToken("token-de-prueba");

  // "error" a propósito: si un test dispara una llamada que nadie mockeó, tiene
  // que fallar fuerte en vez de pegarle a la red de verdad en silencio.
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => server.close());
