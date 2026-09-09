import { describe, expect, it } from "vitest";
import { MAX_ORDERS_WINDOW_DAYS, ordersWindow } from "./query-api";
import { worstSource } from "./data-source";

describe("ordersWindow", () => {
  const now = Date.UTC(2026, 8, 6, 12, 0, 0);

  it("arma los dos filtros de created_at que orders exige", () => {
    // Sin un gte sobre created_at el backend contesta UNBOUNDED_RANGE: toda
    // agregación sobre orders tiene que venir acotada.
    const w = ordersWindow({ from: now - 7 * 86_400_000, to: now });
    expect(w.filters).toEqual([
      { field: "created_at", op: "gte", value: "2026-08-30T12:00:00.000Z" },
      { field: "created_at", op: "lt", value: "2026-09-06T12:00:00.000Z" },
    ]);
  });

  it("no recorta una ventana que entra en los 92 días", () => {
    const w = ordersWindow({ from: now - 90 * 86_400_000, to: now });
    expect(w.clamped).toBe(false);
    expect(w.days).toBe(90);
  });

  it("recorta a 92 días un rango personalizado más ancho", () => {
    // El PeriodPicker deja elegir cualquier rango; el backend rechaza más de 92
    // días con QUERY_TOO_BROAD. Mostrar 92 es mejor que mostrar un error.
    const w = ordersWindow({ from: now - 200 * 86_400_000, to: now });
    expect(w.clamped).toBe(true);
    expect(w.days).toBe(MAX_ORDERS_WINDOW_DAYS);
  });

  it("recorta el extremo viejo, no el reciente", () => {
    // Al revés perderíamos los datos de hoy, que son los que más importan.
    const w = ordersWindow({ from: now - 200 * 86_400_000, to: now });
    expect(w.to.toISOString()).toBe("2026-09-06T12:00:00.000Z");
  });
});

describe("worstSource", () => {
  it("un panel que mezcla dato real con mock no es real", () => {
    expect(worstSource(["live", "mock"])).toBe("mock");
  });

  it("prioriza el problema más grave", () => {
    expect(worstSource(["mock", "unavailable", "forbidden"])).toBe("forbidden");
    expect(worstSource(["live", "unavailable", "mock"])).toBe("unavailable");
  });

  it("todo real es real", () => {
    expect(worstSource(["live", "live"])).toBe("live");
  });
});
