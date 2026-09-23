import { describe, expect, it } from "vitest";
import {
  MAX_ORDERS_WINDOW_DAYS,
  QueryApiError,
  isPermissionError,
  ordersWindow,
  queryEntity,
} from "./query-api";
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

describe("QueryApiError", () => {
  it("conserva code, status y message del backend", () => {
    const error = new QueryApiError("UNKNOWN_ENTITY", "Entidad no disponible", 403);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("QueryApiError");
    expect(error.code).toBe("UNKNOWN_ENTITY");
    expect(error.message).toBe("Entidad no disponible");
    expect(error.status).toBe(403);
  });
});

describe("isPermissionError", () => {
  it("reconoce UNKNOWN_ENTITY para positions y vehicles", () => {
    const error = new QueryApiError("UNKNOWN_ENTITY", "Entidad no disponible", 403);

    expect(isPermissionError(error, "positions")).toBe(true);
    expect(isPermissionError(error, "vehicles")).toBe(true);
  });

  it("no considera permiso denegado a orders o products", () => {
    const error = new QueryApiError("UNKNOWN_ENTITY", "Entidad no disponible", 403);

    expect(isPermissionError(error, "orders")).toBe(false);
    expect(isPermissionError(error, "products")).toBe(false);
  });

  it("no considera permiso denegado otro error", () => {
    expect(isPermissionError(new Error("boom"), "vehicles")).toBe(false);
    expect(isPermissionError(null, "positions")).toBe(false);
  });
});

describe("queryEntity", () => {
  it("devuelve la respuesta cuando el backend responde correctamente", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("@/test/msw/server");

    server.use(
      http.post("*/query/orders", async ({ request }) => {
        const body = await request.json();

        expect(body).toEqual({
          page: 1,
          size: 10,
        });

        return HttpResponse.json({
          items: [
            { id: "ORD-001", status: "COMPLETED" },
            { id: "ORD-002", status: "PENDING" },
          ],
          pagination: {
            page: 1,
            size: 10,
            total_elements: 2,
            total_pages: 1,
          },
        });
      }),
    );

    const response = await queryEntity("orders", {
      page: 1,
      size: 10,
    });

    expect(response).toEqual({
      items: [
        { id: "ORD-001", status: "COMPLETED" },
        { id: "ORD-002", status: "PENDING" },
      ],
      pagination: {
        page: 1,
        size: 10,
        total_elements: 2,
        total_pages: 1,
      },
    });
  });

  it("lanza QueryApiError usando code y message del backend", async () => {
    // Este handler reemplaza temporalmente el MSW general.
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("@/test/msw/server");

    server.use(
      http.post("*/query/orders", () =>
        HttpResponse.json(
          {
            error: {
              code: "QUERY_TOO_BROAD",
              message: "La ventana consultada es demasiado amplia",
            },
          },
          { status: 400 },
        ),
      ),
    );

    await expect(
      queryEntity("orders", {
        page: 1,
        size: 10,
      }),
    ).rejects.toMatchObject({
      name: "QueryApiError",
      code: "QUERY_TOO_BROAD",
      message: "La ventana consultada es demasiado amplia",
      status: 400,
    });
  });

  it("usa HTTP_ERROR y el status cuando el error no contiene JSON válido", async () => {
    const { http, HttpResponse } = await import("msw");
    const { server } = await import("@/test/msw/server");

    server.use(
      http.post(
        "*/query/orders",
        () =>
          new HttpResponse("not-json", {
            status: 503,
            headers: {
              "Content-Type": "text/plain",
            },
          }),
      ),
    );

    await expect(
      queryEntity("orders", {
        page: 1,
        size: 10,
      }),
    ).rejects.toMatchObject({
      name: "QueryApiError",
      code: "HTTP_ERROR",
      message: "HTTP 503",
      status: 503,
    });
  });
});
