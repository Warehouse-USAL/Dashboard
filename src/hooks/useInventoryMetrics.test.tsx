import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/test/msw/server";
import { RESTOCK_LONG_DAYS, useInventoryMetrics } from "./useInventoryMetrics";

type Body = {
  filters?: Array<{ field: string; op: string; value: unknown }>;
  unwind?: string;
  group_by?: Array<{ field: string; as: string }>;
};

/** Producto con la forma real de GET /products (snake_case). */
function product(
  sku: string,
  stock: { available: number; reserved: number; physical: number },
  priceCents: number,
  shouldRestock: boolean | null,
) {
  return {
    id: `p-${sku}`,
    sku,
    name: `Producto ${sku}`,
    price: { amount_cents: priceCents, currency: "ARS" },
    stock: { ...stock, min: 1 },
    restock:
      shouldRestock === null
        ? null
        : {
            should_restock: shouldRestock,
            suggested_quantity: shouldRestock ? 10 : 0,
            reorder_point: 20,
            target_stock: 50,
            inventory_position: stock.available,
            calculated_at: "2026-10-07T06:00:00Z",
          },
  };
}

/**
 * Catálogo de prueba, pensado para que cada caso tenga exactamente un producto:
 * - A: agotado Y a reponer (el caso que se superpone), con demanda
 * - B: a reponer, con demanda
 * - C: con stock y SIN demanda en la ventana del cron  -> dead stock
 * - D: ok, con demanda
 * - E: agotado, sin stock físico y sin demanda          -> NO es dead stock
 */
const PRODUCTS = [
  product("A", { available: 0, reserved: 5, physical: 5 }, 1000, true),
  product("B", { available: 10, reserved: 0, physical: 10 }, 2000, true),
  product("C", { available: 50, reserved: 0, physical: 50 }, 1000, false),
  product("D", { available: 20, reserved: 0, physical: 20 }, 500, false),
  product("E", { available: 0, reserved: 0, physical: 0 }, 1000, null),
];

/** Demanda en la ventana del cron: A, B y D pidieron; C y E no. */
const CRON_WINDOW_DEMAND = [
  { sku: "A", qty: 5 },
  { sku: "B", qty: 30 },
  { sku: "D", qty: 9 },
];

/** La consulta de dead stock es la única que pide "no canceladas" (criterio del cron). */
function isCronDemandQuery(body: Body): boolean {
  return !!body.filters?.some(
    (f) => f.field === "status" && f.op === "ne" && f.value === "CANCELLED",
  );
}

function page<T>(items: T[]) {
  return { items, pagination: { page: 0, size: 200, total_elements: items.length, total_pages: 1 } };
}

/** Monta los handlers del backend y devuelve los bodies de /query/orders que llegaron. */
function mockBackend(options: { cronDemandNeverResponds?: boolean } = {}) {
  const queryBodies: Body[] = [];
  server.use(
    http.get("*/products", () =>
      HttpResponse.json({
        products: PRODUCTS,
        pagination: { page: 0, size: 50, total_elements: PRODUCTS.length, total_pages: 1 },
      }),
    ),
    http.get("*/warehouse/zones", () => HttpResponse.json({ zones: [] })),
    http.post("*/query/orders", async ({ request }) => {
      const body = (await request.json()) as Body;
      queryBodies.push(body);
      if (isCronDemandQuery(body)) {
        if (options.cronDemandNeverResponds) await delay("infinite");
        return HttpResponse.json(page(CRON_WINDOW_DEMAND));
      }
      return HttpResponse.json(page([]));
    }),
  );
  return queryBodies;
}

function renderMetrics() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useInventoryMetrics("30d"), { wrapper });
}

describe("useInventoryMetrics — reposición del cron", () => {
  it("cuenta 'a reponer' y 'agotados' por separado: un agotado que también hay que reponer cuenta en los dos", async () => {
    mockBackend();
    const { result } = renderMetrics();

    await waitFor(() => expect(result.current.kpis.skusToRestock).toBe(2));

    // A (agotado y a reponer) y B -> a reponer. A y E -> agotados.
    expect(result.current.kpis.skusToRestock).toBe(2);
    expect(result.current.kpis.skusDepleted).toBe(2);
  });

  it("el estado de la fila da prioridad a agotado, pero conserva los dos datos", async () => {
    mockBackend();
    const { result } = renderMetrics();

    await waitFor(() => expect(result.current.kpis.skusToRestock).toBe(2));

    const byStatus = (sku: string) => result.current.products.find((p) => p.sku === sku)!;
    expect(byStatus("A").status).toBe("agotado");
    expect(byStatus("A").isDepleted).toBe(true);
    expect(byStatus("A").needsRestock).toBe(true);
    expect(byStatus("B").status).toBe("a_reponer");
    expect(byStatus("C").status).toBe("ok");
    expect(byStatus("E").status).toBe("agotado");
    // sin recomendación (restock null) no hay forma de saber que hay que reponer
    expect(byStatus("E").needsRestock).toBe(false);
  });

  it("dead stock: con stock físico y sin pedidos en la ventana del cron; valora a precio × físico", async () => {
    mockBackend();
    const { result } = renderMetrics();

    await waitFor(() => expect(result.current.kpis.deadStockCount).toBe(1));

    // Sólo C: A/B/D tienen demanda y E no tiene stock físico.
    expect(result.current.kpis.deadStockValue).toBeCloseTo((50 * 1000) / 100);
    // valor total = Σ físico × precio (incluye lo reservado)
    expect(result.current.kpis.totalValue).toBeCloseTo((5 * 1000 + 10 * 2000 + 50 * 1000 + 20 * 500) / 100);
  });

  it("dead stock se mide con el mismo criterio y ventana que el cron: no canceladas, creadas en los últimos 60 días", async () => {
    // El cron usa RESTOCK_LONG_DAYS=60 por defecto (docker-compose del backend). Si
    // alguien cambia la constante sin cambiar el cron, este test lo avisa.
    expect(RESTOCK_LONG_DAYS).toBe(60);

    const queryBodies = mockBackend();
    const { result } = renderMetrics();
    await waitFor(() => expect(result.current.kpis.deadStockCount).toBe(1));

    const body = queryBodies.find(isCronDemandQuery)!;
    expect(body.unwind).toBe("items");
    expect(body.group_by).toEqual([{ field: "items.sku", as: "sku" }]);

    const desde = body.filters!.find((f) => f.field === "created_at" && f.op === "gte")!;
    const esperado = Date.now() - RESTOCK_LONG_DAYS * 86_400_000;
    expect(Math.abs(new Date(desde.value as string).getTime() - esperado)).toBeLessThan(3_600_000);
  });

  it("mientras no responde la consulta de demanda no se cuenta ningún dead stock", async () => {
    // Sin este resguardo todo el catálogo con stock aparecería como dead stock
    // hasta que lleguen los datos (no hay demanda "todavía" para ningún SKU).
    mockBackend({ cronDemandNeverResponds: true });
    const { result } = renderMetrics();

    await waitFor(() => expect(result.current.kpis.skusToRestock).toBe(2));

    expect(result.current.kpis.deadStockCount).toBe(0);
    expect(result.current.kpis.deadStockValue).toBe(0);
  });
});
