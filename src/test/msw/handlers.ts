import { http, HttpResponse } from "msw";

/**
 * Fixtures con la forma REAL que devuelve wh-backend en GET /orders.
 *
 * Importante: el backend serializa con Jackson en SNAKE_CASE global
 * (config/JacksonConfig.java), así que los campos del Java `OrderResponse`
 * (`assignedVehicleId`, `timestamps.createdAt`, `cancelReason`...) llegan al
 * frontend como `assigned_vehicle_id`, `timestamps.created_at`, `cancel_reason`.
 * El fixture respeta eso a propósito: si alguien cambia mapOrder para leer otros
 * nombres, estos tests se ponen en rojo.
 */

/** Fechas relativas a "ahora": el filtro de período por defecto es 24h, así que
 *  una fecha fija (ej. "2026-05-01") quedaría siempre fuera del rango y la tabla
 *  se vería vacía. */
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60 * 1000).toISOString();
}

export const backendOrders = [
  {
    id: "ORD-1001",
    status: "in_progress",
    requested_by_user_id: "USR-01",
    items: [{ product_id: "PROD-001", sku: "SKU-A102", quantity: 3 }],
    destination_area: "AREA-B",
    assigned_vehicle_id: "VHC-001",
    timestamps: { created_at: hoursAgo(2), started_at: hoursAgo(1), completed_at: null },
    cancel_reason: null,
  },
  {
    id: "ORD-1002",
    status: "pending",
    requested_by_user_id: "USR-01",
    items: [{ product_id: "PROD-002", sku: "SKU-B441", quantity: 1 }],
    destination_area: "AREA-C",
    assigned_vehicle_id: null,
    timestamps: { created_at: hoursAgo(3), started_at: null, completed_at: null },
    cancel_reason: null,
  },
  {
    id: "ORD-1003",
    status: "completed",
    requested_by_user_id: "USR-02",
    items: [{ product_id: "PROD-003", sku: "SKU-C019", quantity: 5 }],
    destination_area: "AREA-A",
    assigned_vehicle_id: "VHC-002",
    // completada en 3 minutos -> dentro del SLA de 5 min que mide la página
    timestamps: {
      created_at: minutesAgo(63),
      started_at: minutesAgo(62),
      completed_at: minutesAgo(60),
    },
    cancel_reason: null,
  },
  {
    id: "ORD-1004",
    status: "cancelled",
    requested_by_user_id: "USR-02",
    items: [{ product_id: "PROD-004", sku: "SKU-D227", quantity: 2 }],
    destination_area: "AREA-D",
    assigned_vehicle_id: "VHC-003",
    timestamps: { created_at: hoursAgo(5), started_at: hoursAgo(5), completed_at: null },
    cancel_reason: "Producto no encontrado",
  },
];

/**
 * Filas agregadas de `POST /query/orders`.
 *
 * Ojo con `status`: acá va en MAYÚSCULAS a propósito. `/query/*` lee documentos
 * crudos de Mongo, mientras que `GET /orders` los serializa con Jackson y el
 * @JsonValue de OrderStatus los pasa a minúsculas. Son dos vocabularios reales
 * conviviendo, y el fixture lo respeta para que un mapeo que asuma minúsculas
 * en todos lados se ponga en rojo acá.
 */
export const queryOrdersByVehicle = [
  { vehicle: "VHC-001", status: "COMPLETED", orders: 8 },
  { vehicle: "VHC-001", status: "CANCELLED", orders: 2 },
  { vehicle: "VHC-002", status: "COMPLETED", orders: 5 },
];

export const queryOrdersByHour = [
  { hour: "2026-09-06T10:00:00", orders: 3 },
  { hour: "2026-09-06T11:00:00", orders: 7 },
];

/**
 * Series de `POST /metrics/query`.
 *
 * `points` son pares `[epochSegundos, valor]`, no objetos: es la forma exacta
 * que devuelve el backend y de la que dependen sumPoints/avgPoints.
 */
export const metricsFailureSeries = {
  metric: "wh.vehicle.transitions",
  unit: "1",
  step: "1h",
  series: [
    {
      labels: { vehicle_id: "VHC-001" },
      points: [
        [1_788_000_000, 1],
        [1_788_003_600, 2],
      ],
    },
    {
      labels: { vehicle_id: "VHC-002" },
      points: [
        [1_788_000_000, 0],
        [1_788_003_600, 0],
      ],
    },
  ],
};

export const handlers = [
  // Wildcard para no depender de VITE_API_URL (en dev el front pega a rutas
  // relativas vía el proxy de Vite, así que BASE_URL suele ser "").
  http.get("*/orders", ({ request }) => {
    const status = new URL(request.url).searchParams.get("status");
    const orders = status ? backendOrders.filter((o) => o.status === status) : backendOrders;

    return HttpResponse.json({
      orders,
      pagination: {
        page: 0,
        size: 50,
        total_elements: orders.length,
        total_pages: 1,
      },
    });
  }),

  // Un solo endpoint con dos modos; se decide por lo que pide el body, igual que
  // el backend decide entre find() y aggregate().
  http.post("*/query/:entity", async ({ request }) => {
    const body = (await request.json()) as {
      group_by?: Array<{ field: string; as: string }>;
    };
    const keys = (body.group_by ?? []).map((g) => g.as);
    const items = keys.includes("vehicle")
      ? queryOrdersByVehicle
      : keys.includes("hour")
        ? queryOrdersByHour
        : [];
    return HttpResponse.json({
      items,
      pagination: { page: 0, size: 500, total_elements: items.length, total_pages: 1 },
    });
  }),

  http.post("*/metrics/query", () => HttpResponse.json(metricsFailureSeries)),
];
