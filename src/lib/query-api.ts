/**
 * Cliente de `POST /query/{entity}` — las agregaciones de negocio sobre MongoDB
 * que el backend expuso en d303857.
 *
 * Un solo endpoint con dos modos: sin `group_by`/`aggregates` devuelve
 * documentos, con cualquiera de los dos devuelve una fila por grupo. La
 * respuesta tiene la misma forma en ambos casos (`items` + `pagination`).
 *
 * El catálogo (`GET /query/catalog`) es la fuente de verdad de qué campos
 * existen; los tipos de acá describen la *gramática*, no la lista de campos, a
 * propósito: la lista se desactualiza, la gramática no.
 */
import { apiPost } from "./api";

export type Entity = "orders" | "products" | "vehicles" | "positions";

export type Operator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "nin"
  | "contains"
  | "exists";

export type Filter = { field: string; op: Operator; value: unknown };
export type SortSpec = { field: string; dir: "asc" | "desc" };
/** `bucket` sólo aplica a campos de fecha. `as` nombra la columna de salida. */
export type GroupSpec = { field: string; bucket?: "hour" | "day" | "month"; as: string };
/** `field` es obligatorio para todo op excepto `count`. */
export type AggregateSpec = {
  op: "count" | "sum" | "avg" | "min" | "max";
  field?: string;
  as: string;
};

export type QueryRequest = {
  filters?: Filter[];
  sort?: SortSpec[];
  fields?: string[];
  page?: number;
  size?: number;
  /** Obligatorio para tocar cualquier campo `items.*`. */
  unwind?: string;
  group_by?: GroupSpec[];
  aggregates?: AggregateSpec[];
  timezone?: string;
};

export type Pagination = {
  page: number;
  size: number;
  total_elements: number;
  total_pages: number;
};

export type QueryResponse<T> = { items: T[]; pagination: Pagination };

/**
 * Error con el `code` del backend.
 *
 * `code` es lo que hay que mirar; `message` es para mostrar. Los códigos están
 * en DASHBOARD_INTEGRATION.md §7.
 */
export class QueryApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "QueryApiError";
  }
}

/**
 * `positions` y `vehicles` sólo son visibles para roles de almacén, y el backend
 * responde `UNKNOWN_ENTITY` en vez de 403 para no revelar que existen
 * (EntityQueryService.java:61). Para nosotros eso es "sin permiso", no un error
 * de tipeo: el nombre de la entidad lo pone este módulo, no el usuario.
 */
export function isPermissionError(err: unknown, entity: Entity): boolean {
  return (
    err instanceof QueryApiError &&
    err.code === "UNKNOWN_ENTITY" &&
    (entity === "positions" || entity === "vehicles")
  );
}

export async function queryEntity<T = Record<string, unknown>>(
  entity: Entity,
  request: QueryRequest,
): Promise<QueryResponse<T>> {
  const res = await apiPost(`/query/${entity}`, request);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new QueryApiError(
      body?.error?.code ?? "HTTP_ERROR",
      body?.error?.message ?? `HTTP ${res.status}`,
      res.status,
    );
  }
  return (await res.json()) as QueryResponse<T>;
}

/**
 * Tope de ventana que `orders` acepta en modo agregado (AggregationTranslator
 * MAX_RANGE). Más que esto es `QUERY_TOO_BROAD`.
 */
export const MAX_ORDERS_WINDOW_DAYS = 92;

/**
 * Los dos filtros de `created_at` que toda agregación sobre `orders` exige.
 *
 * Recorta el extremo viejo a 92 días en vez de dejar que el backend rechace la
 * consulta: el PeriodPicker permite rangos personalizados de cualquier ancho, y
 * un panel que muestra 92 días es mejor que uno que muestra un error. Devuelve
 * `clamped` para que quien llama pueda avisarlo.
 *
 * Sólo para `orders`. En `positions`/`products`/`vehicles` filtrar por fecha
 * está prohibido: descartaría en silencio el stock más viejo.
 */
export function ordersWindow(bounds: { from: number; to: number }): {
  filters: [Filter, Filter];
  from: Date;
  to: Date;
  days: number;
  clamped: boolean;
} {
  const maxMs = MAX_ORDERS_WINDOW_DAYS * 86_400_000;
  const clamped = bounds.to - bounds.from > maxMs;
  const from = new Date(clamped ? bounds.to - maxMs : bounds.from);
  const to = new Date(bounds.to);
  return {
    filters: [
      { field: "created_at", op: "gte", value: from.toISOString() },
      { field: "created_at", op: "lt", value: to.toISOString() },
    ],
    from,
    to,
    days: (to.getTime() - from.getTime()) / 86_400_000,
    clamped,
  };
}
