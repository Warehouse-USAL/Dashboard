import { describe, it, expect, vi } from "vitest";
import {
  mapVehicle,
  mapOrder,
  mapOrderPriority,
  getOrders,
  getActiveOrders,
  getProducts,
  getVehicles,
  getAllPositions,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
  getStoredRole,
  canReadFleetMetrics,
  login,
  apiPost,
  getWsUrl,
} from "./api";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";

describe("mapVehicle", () => {
  it("mapea un vehículo del backend al shape Rover que usa el dashboard", () => {
    const rover = mapVehicle({
      id: "VHC-001",
      name: "Rover-01",
      status: "busy",
      position: { x: 14.2, y: 9.1 },
      battery: 79,
      current_order_id: "ORD-1001",
      last_seen_at: "2026-05-01T10:03:45Z",
    });

    expect(rover).toEqual({
      id: "VHC-001",
      name: "Rover-01",
      state: "busy",
      battery: 79,
      hours: 0,
      order: "ORD-1001",
      zone: "—",
      x: 14.2,
      y: 9.1,
      vx: 0,
      vy: 0,
    });
  });
});

describe("mapOrder", () => {
  it("para producto el campo suelto gana, pero para cantidad gana el ítem (prioridades cruzadas)", () => {
    const order = mapOrder({
      id: "ORD-1",
      product: "FLAT-PRODUCT",
      quantity: 99,
      items: [{ productId: "P1", sku: "ITEM-SKU", quantity: 3 }],
    });

    expect(order.product).toBe("FLAT-PRODUCT");
    expect(order.qty).toBe(3);
  });

  it("prioriza assigned_vehicle_id sobre los demás alias de vehículo", () => {
    const order = mapOrder({
      id: "ORD-2",
      assigned_vehicle_id: "VHC-A",
      assignedVehicleId: "VHC-B",
      vehicle_id: "VHC-C",
      rover: "VHC-D",
    });

    expect(order.rover).toBe("VHC-A");
  });

  it("sin ningún dato usa los valores por defecto de producto, cantidad, vehículo, prioridad y estado", () => {
    const order = mapOrder({ id: "ORD-3" });

    expect(order.product).toBe("—");
    expect(order.qty).toBe(1);
    expect(order.rover).toBe("—");
    expect(order.priority).toBe("media");
    expect(order.state).toBe("en espera");
  });

  it("traduce estados conocidos del backend y deja pasar los desconocidos sin traducir", () => {
    expect(mapOrder({ id: "ORD-4", status: "in_progress" }).state).toBe("en proceso");
    expect(mapOrder({ id: "ORD-5", status: "weird_status" }).state).toBe("weird_status");
  });
});

describe("mapOrderPriority", () => {
  // La tabla de Órdenes filtra por un Set de {urgente,alta,media,baja}: una
  // prioridad sin traducir no matchea y la fila desaparece sin ningún error. Por
  // eso esto se testea, y no como cosmética.
  it("traduce las cuatro prioridades del backend", () => {
    expect(mapOrderPriority("low")).toBe("baja");
    expect(mapOrderPriority("medium")).toBe("media");
    expect(mapOrderPriority("high")).toBe("alta");
    expect(mapOrderPriority("urgent")).toBe("urgente");
  });

  it("acepta MAYÚSCULAS, que es como llegan desde /query/orders", () => {
    // GET /orders las serializa en minúsculas con el @JsonValue del enum, pero
    // /query/* lee el documento crudo de Mongo. Las dos grafías son reales.
    expect(mapOrderPriority("URGENT")).toBe("urgente");
    expect(mapOrderPriority("HIGH")).toBe("alta");
  });

  it("las órdenes anteriores al deploy del backend vienen sin prioridad", () => {
    // No hay backfill: leen priority: null. Se muestran como "media", que es
    // además el default del backend para las nuevas.
    expect(mapOrderPriority(null)).toBe("media");
    expect(mapOrderPriority(undefined)).toBe("media");
  });

  it("una prioridad desconocida pasa sin traducir en vez de disfrazarse de media", () => {
    // Si el backend agrega un quinto valor, preferimos verlo crudo en la UI
    // antes que contarlo en silencio como "media".
    expect(mapOrderPriority("CRITICAL")).toBe("critical");
  });
});

it("envía correctamente los filtros al endpoint /orders", async () => {
  let requestedUrl = "";

  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    return originalFetch(input, init);
  };

  try {
    await getOrders("pending", "2026-09-20T00:00:00.000Z", 25, "VHC-001");
  } finally {
    globalThis.fetch = originalFetch;
  }

  expect(requestedUrl).toContain("/orders?");
  expect(requestedUrl).toContain("status=pending");
  expect(requestedUrl).toContain("from=2026-09-20T00%3A00%3A00.000Z");
  expect(requestedUrl).toContain("size=25");
  expect(requestedUrl).toContain("vehicleId=VHC-001");
});
it("obtiene las órdenes del backend y las transforma al modelo del Dashboard", async () => {
  const result = await getOrders();

  expect(result).toHaveLength(4);

  expect(result[0]).toMatchObject({
    id: "ORD-1001",
    product: "SKU-A102",
    qty: 3,
    state: "en proceso",
    rover: "VHC-001",
  });

  expect(result[1]).toMatchObject({
    id: "ORD-1002",
    product: "SKU-B441",
    qty: 1,
    state: "en espera",
    rover: "—",
  });

  expect(result[2]).toMatchObject({
    id: "ORD-1003",
    product: "SKU-C019",
    qty: 5,
    state: "completada",
    rover: "VHC-002",
  });

  expect(result[3]).toMatchObject({
    id: "ORD-1004",
    product: "SKU-D227",
    qty: 2,
    state: "cancelada",
    rover: "VHC-003",
    cancelReason: "Producto no encontrado",
  });
});
describe("getOrders - fallback", () => {
  it("devuelve las órdenes mock cuando el backend responde con error", async () => {
    server.use(
      http.get("*/orders", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const result = await getOrders();

    expect(result).toHaveLength(7);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "OR-12504",
          product: "SKU-A102 · Caja 24u",
          qty: 3,
          priority: "alta",
          state: "en proceso",
          rover: "R-01",
        }),
        expect.objectContaining({
          id: "OR-12517",
          product: "SKU-E308 · Pallet",
          state: "en espera",
        }),
      ]),
    );
  });
});
describe("getProducts", () => {
  it("obtiene productos y calcula correctamente ok, bajo y agotado", async () => {
    server.use(
      http.get("*/products", () =>
        HttpResponse.json({
          products: [
            {
              id: "P-001",
              sku: "SKU-OK",
              name: "Producto normal",
              stock: {
                available: 10,
                reserved: 2,
                minimumStock: 5,
              },
              price: {
                amount_cents: 12500,
                currency: "ARS",
              },
              location: {
                zone: "A",
                line: "3",
              },
            },
            {
              id: "P-002",
              sku: "SKU-BAJO",
              name: "Producto bajo",
              stock: {
                available: 3,
                reserved: 1,
                minimumStock: 5,
              },
              price: {
                amount_cents: 8900,
                currency: "ARS",
              },
              location: {
                zone: "B",
                line: "2",
              },
            },
            {
              id: "P-003",
              sku: "SKU-AGOTADO",
              name: "Producto agotado",
              stock: {
                available: 0,
                reserved: 4,
                minimumStock: 5,
              },
              price: {
                amount_cents: 15000,
                currency: "ARS",
              },
              location: {
                zone: "C",
                line: "1",
              },
            },
          ],
        }),
      ),
    );

    const result = await getProducts();

    expect(result).toEqual([
      expect.objectContaining({
        id: "P-001",
        sku: "SKU-OK",
        available: 10,
        reserved: 2,
        minimum: 5,
        priceCents: 12500,
        currency: "ARS",
        status: "ok",
      }),
      expect.objectContaining({
        id: "P-002",
        sku: "SKU-BAJO",
        available: 3,
        reserved: 1,
        minimum: 5,
        priceCents: 8900,
        currency: "ARS",
        status: "bajo",
      }),
      expect.objectContaining({
        id: "P-003",
        sku: "SKU-AGOTADO",
        available: 0,
        reserved: 4,
        minimum: 5,
        priceCents: 15000,
        currency: "ARS",
        status: "agotado",
      }),
    ]);
  });
});
it("devuelve los productos mock cuando el backend responde con error", async () => {
  server.use(
    http.get("*/products", () => {
      return new HttpResponse(null, { status: 500 });
    }),
  );

  const result = await getProducts();

  expect(result).toHaveLength(5);

  expect(result).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sku: "SKU-A102",
        available: 142,
        status: "ok",
      }),
      expect.objectContaining({
        sku: "SKU-C019",
        available: 9,
        status: "bajo",
      }),
      expect.objectContaining({
        sku: "SKU-E308",
        available: 0,
        status: "agotado",
      }),
    ]),
  );
});
describe("getVehicles", () => {
  it("obtiene los vehículos y los transforma al modelo Rover del Dashboard", async () => {
    server.use(
      http.get("*/vehicles", () =>
        HttpResponse.json({
          vehicles: [
            {
              id: "VHC-001",
              name: "Rover-01",
              status: "busy",
              position: { x: 14.2, y: 9.1 },
              battery: 79,
              current_order_id: "ORD-1001",
              last_seen_at: "2026-09-21T20:00:00Z",
            },
            {
              id: "VHC-002",
              name: "Rover-02",
              status: "idle",
              position: { x: 50, y: 30 },
              battery: 92,
              current_order_id: null,
              last_seen_at: "2026-09-21T20:01:00Z",
            },
          ],
        }),
      ),
    );

    const result = await getVehicles();

    expect(result).toHaveLength(2);

    expect(result[0]).toMatchObject({
      id: "VHC-001",
      name: "Rover-01",
      state: "busy",
      battery: 79,
      order: "ORD-1001",
      x: 14.2,
      y: 9.1,
    });

    expect(result[1]).toMatchObject({
      id: "VHC-002",
      name: "Rover-02",
      state: "idle",
      battery: 92,
      order: null,
      x: 50,
      y: 30,
    });
  });
});
it("devuelve los rovers mock cuando el backend responde con error", async () => {
  server.use(
    http.get("*/vehicles", () => {
      return new HttpResponse(null, { status: 500 });
    }),
  );

  const result = await getVehicles();

  expect(result).toHaveLength(3);

  expect(result).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "R-01",
      }),
      expect.objectContaining({
        id: "R-02",
      }),
      expect.objectContaining({
        id: "R-03",
      }),
    ]),
  );
});
describe("getAllPositions", () => {
  it("recorre zonas, líneas y posiciones y devuelve una lista plana enriquecida", async () => {
    server.use(
      http.get("*/warehouse/zones", () =>
        HttpResponse.json({
          zones: [
            {
              id_zone: "ZONE-1",
              zone_code: "A",
            },
            {
              id_zone: "ZONE-2",
              zone_code: "B",
            },
          ],
        }),
      ),

      http.get("*/warehouse/zones/:zoneId/lines", ({ params }) => {
        if (params.zoneId === "ZONE-1") {
          return HttpResponse.json({
            lines: [
              {
                id_line: "LINE-1",
                number_line: 3,
              },
              {
                id_line: "LINE-2",
                number_line: 4,
              },
            ],
          });
        }

        return HttpResponse.json({
          lines: [
            {
              id_line: "LINE-3",
              number_line: 1,
            },
          ],
        });
      }),

      http.get("*/warehouse/lines/:lineId/positions", ({ params }) => {
        const positions: Record<string, unknown[]> = {
          "LINE-1": [
            {
              id_position: "POS-1",
              id_line: "LINE-1",
              id_zone: "ZONE-1",
              position_name: "A3-01",
              product_id: "P-001",
              current_stock: 10,
              maximum_capacity: 20,
              is_active: true,
            },
          ],
          "LINE-2": [
            {
              id_position: "POS-2",
              id_line: "LINE-2",
              id_zone: "ZONE-1",
              position_name: "A4-01",
              product_id: null,
              current_stock: 0,
              maximum_capacity: 20,
              is_active: true,
            },
          ],
          "LINE-3": [
            {
              id_position: "POS-3",
              id_line: "LINE-3",
              id_zone: "ZONE-2",
              position_name: "B1-01",
              product_id: "P-002",
              current_stock: 7,
              maximum_capacity: 15,
              is_active: true,
            },
          ],
        };

        return HttpResponse.json({
          positions: positions[String(params.lineId)] ?? [],
        });
      }),
    );

    const result = await getAllPositions();

    expect(result).toHaveLength(3);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id_position: "POS-1",
          id_line: "LINE-1",
          id_zone: "ZONE-1",
          product_id: "P-001",
          current_stock: 10,
          zone_code: "A",
          number_line: 3,
        }),
        expect.objectContaining({
          id_position: "POS-2",
          id_line: "LINE-2",
          id_zone: "ZONE-1",
          product_id: null,
          current_stock: 0,
          zone_code: "A",
          number_line: 4,
        }),
        expect.objectContaining({
          id_position: "POS-3",
          id_line: "LINE-3",
          id_zone: "ZONE-2",
          product_id: "P-002",
          current_stock: 7,
          zone_code: "B",
          number_line: 1,
        }),
      ]),
    );
  });
});
it("tolera errores parciales en líneas y posiciones sin perder los datos válidos", async () => {
  server.use(
    http.get("*/warehouse/zones", () =>
      HttpResponse.json({
        zones: [
          {
            id_zone: "ZONE-1",
            zone_code: "A",
          },
        ],
      }),
    ),

    http.get("*/warehouse/zones/:zoneId/lines", ({ params }) => {
      if (params.zoneId !== "ZONE-1") {
        return HttpResponse.json({ lines: [] });
      }

      return HttpResponse.json({
        lines: [
          {
            id_line: "LINE-OK",
            number_line: 1,
          },
          {
            id_line: "LINE-ERROR",
            number_line: 2,
          },
        ],
      });
    }),

    http.get("*/warehouse/lines/:lineId/positions", ({ params }) => {
      if (params.lineId === "LINE-ERROR") {
        return new HttpResponse(null, { status: 500 });
      }

      return HttpResponse.json({
        positions: [
          {
            id_position: "POS-OK",
            id_line: "LINE-OK",
            id_zone: "ZONE-1",
            position_name: "A1-01",
            product_id: "P-001",
            current_stock: 8,
            maximum_capacity: 20,
            is_active: true,
          },
        ],
      });
    }),
  );

  const result = await getAllPositions();

  expect(result).toHaveLength(1);

  expect(result[0]).toMatchObject({
    id_position: "POS-OK",
    id_line: "LINE-OK",
    zone_code: "A",
    number_line: 1,
  });
});
it("devuelve una lista vacía si falla la consulta inicial de zonas", async () => {
  server.use(
    http.get("*/warehouse/zones", () => {
      return new HttpResponse(null, { status: 500 });
    }),
  );

  const result = await getAllPositions();

  expect(result).toEqual([]);
});
describe("session y permisos", () => {
  it("guarda, recupera y limpia el token", () => {
    setStoredToken("token-test");

    expect(getStoredToken()).toBe("token-test");

    clearStoredToken();

    expect(getStoredToken()).toBeNull();
  });

  it("guarda y recupera el rol desde sessionStorage", () => {
    clearStoredToken();

    window.sessionStorage.setItem("wh_role", "DASHBOARD");

    expect(getStoredRole()).toBe("DASHBOARD");
    expect(canReadFleetMetrics()).toBe(true);
  });

  it("permite métricas de flota solo a los roles autorizados", () => {
    const allowedRoles = ["SUPERADMIN", "ADMIN_SYSTEM", "ADMIN_WAREHOUSE", "DASHBOARD"] as const;

    for (const role of allowedRoles) {
      clearStoredToken();
      window.sessionStorage.setItem("wh_role", role);

      expect(canReadFleetMetrics()).toBe(true);
    }
  });

  it("rechaza métricas de flota para roles no autorizados", () => {
    const deniedRoles = ["ADMIN_SALES", "PROVIDER", "DISPATCHER", "OPERATOR"] as const;

    for (const role of deniedRoles) {
      clearStoredToken();
      window.sessionStorage.setItem("wh_role", role);

      expect(canReadFleetMetrics()).toBe(false);
    }
  });

  it("rechaza métricas de flota cuando no hay rol", () => {
    clearStoredToken();

    expect(getStoredRole()).toBeNull();
    expect(canReadFleetMetrics()).toBe(false);
  });
});
describe("login", () => {
  it("envía las credenciales y guarda token y rol cuando el login es exitoso", async () => {
    let requestBody: unknown;

    server.use(
      http.post("*/auth/login", async ({ request }) => {
        requestBody = await request.json();

        return HttpResponse.json({
          token: "token-login-test",
          user: {
            role: "DASHBOARD",
          },
        });
      }),
    );

    clearStoredToken();

    await login("usuario@test.com", "password123");

    expect(requestBody).toEqual({
      email: "usuario@test.com",
      password: "password123",
    });

    expect(getStoredToken()).toBe("token-login-test");
    expect(getStoredRole()).toBe("DASHBOARD");
    expect(canReadFleetMetrics()).toBe(true);
  });

  it("guarda el token aunque la respuesta no incluya rol", async () => {
    server.use(
      http.post("*/auth/login", () =>
        HttpResponse.json({
          token: "token-sin-rol",
        }),
      ),
    );

    clearStoredToken();

    await login("usuario@test.com", "password123");

    expect(getStoredToken()).toBe("token-sin-rol");
    expect(getStoredRole()).toBeNull();
  });

  it("lanza error cuando el backend rechaza el login", async () => {
    server.use(
      http.post("*/auth/login", () => {
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(login("usuario@test.com", "password-incorrecta")).rejects.toThrow(
      "Login failed: 401",
    );
  });
});
describe("apiPost", () => {
  it("envía un POST autenticado con JSON", async () => {
    let requestBody: unknown;
    let authorization = "";
    let contentType = "";

    server.use(
      http.post("*/test-endpoint", async ({ request }) => {
        requestBody = await request.json();
        authorization = request.headers.get("Authorization") ?? "";
        contentType = request.headers.get("Content-Type") ?? "";

        return HttpResponse.json({
          ok: true,
        });
      }),
    );

    setStoredToken("token-api-post");

    const result = await apiPost("/test-endpoint", {
      foo: "bar",
      value: 42,
    });

    expect(result.ok).toBe(true);
    expect(requestBody).toEqual({
      foo: "bar",
      value: 42,
    });
    expect(authorization).toBe("Bearer token-api-post");
    expect(contentType).toContain("application/json");
  });
});
describe("apiPost - 401", () => {
  it("devuelve la respuesta 401 del backend", async () => {
    server.use(
      http.post("*/test-endpoint-401", () => {
        return new HttpResponse(null, { status: 401 });
      }),
    );

    setStoredToken("token-que-debe-limpiarse");

    const response = await apiPost("/test-endpoint-401", {
      foo: "bar",
    });

    expect(response.status).toBe(401);
    expect(response.ok).toBe(false);
  });
});
describe("getWsUrl", () => {
  it("construye la URL WebSocket desde la ubicación actual cuando no hay BASE_URL", async () => {
    const originalLocation = window.location;

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        protocol: "http:",
        host: "localhost:3000",
      },
    });

    setStoredToken("token-ws");

    const url = await getWsUrl();

    expect(url).toBe("ws://localhost:3000/ws/v1/vehicles?token=token-ws");

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });
});
describe("autenticación interna", () => {
  it("falla cuando no hay token autenticado", async () => {
    clearStoredToken();

    await expect(getWsUrl()).rejects.toThrow("Not authenticated");
  });

  it("maneja 401 en apiFetch limpiando el token", async () => {
    server.use(
      http.get("*/vehicles", () => {
        return new HttpResponse(null, { status: 401 });
      }),
    );

    setStoredToken("token-expirado");

    const response = await getVehicles();

    expect(response).toHaveLength(3);
    expect(getStoredToken()).toBeNull();
  });
});
describe("getWsUrl con BASE_URL", () => {
  it("convierte HTTP en WebSocket cuando existe una URL base", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "http://localhost:8080");

    const { getWsUrl, setStoredToken } = await import("./api");

    setStoredToken("token-ws-base");

    const url = await getWsUrl("/ws/v1/vehicles");

    expect(url).toBe("ws://localhost:8080/ws/v1/vehicles?token=token-ws-base");

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
describe("getActiveOrders", () => {
  // GET /orders sin status trae una sola página de 50 sin orden garantizado —
  // el bug real. getActiveOrders() esquiva eso pidiendo cada status aparte y
  // recorriendo TODAS sus páginas: acá se prueba justo el caso en que un solo
  // status por sí solo ya supera una página.
  it("junta todas las páginas cuando un status por sí solo supera el tamaño de página", async () => {
    const pendingOrders = Array.from({ length: 55 }, (_, i) => ({
      id: `ORD-PENDING-${i}`,
      status: "pending",
      items: [{ product_id: "P1", sku: "SKU-X", quantity: 1 }],
      timestamps: { created_at: new Date().toISOString() },
    }));

    server.use(
      http.get("*/orders", ({ request }) => {
        const url = new URL(request.url);
        const status = url.searchParams.get("status");
        const page = Number(url.searchParams.get("page") ?? "0");
        const size = Number(url.searchParams.get("size") ?? "50");
        const filtered = status === "pending" ? pendingOrders : [];
        const start = page * size;
        return HttpResponse.json({
          orders: filtered.slice(start, start + size),
          pagination: {
            page,
            size,
            total_elements: filtered.length,
            total_pages: Math.max(1, Math.ceil(filtered.length / size)),
          },
        });
      }),
    );

    const result = await getActiveOrders();

    expect(result).toHaveLength(55);
  });
});
