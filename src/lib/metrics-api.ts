/**
 * Cliente de `POST /metrics/query` — las series temporales de rovers que el
 * backend publica desde VictoriaMetrics (d303857).
 *
 * El backend publica señales crudas y nada derivado: no hay endpoint de MTBF ni
 * de tasa de fallas, porque esas son divisiones nuestras y sus umbrales también.
 * Las fórmulas de abajo son las de DASHBOARD_INTEGRATION.md §6, recetas 3 y 4.
 */
import { apiPost, canReadFleetMetrics } from "./api";

/** Las tres métricas del catálogo (MetricRegistry.java). */
export type MetricName = "wh.vehicle.battery" | "wh.vehicle.state" | "wh.vehicle.transitions";

/** Cada métrica acepta sólo algunas: un promedio sobre un counter no significa nada. */
export type Aggregation = "count" | "avg" | "min" | "max" | "last" | "increase" | "rate";

export type VehicleState = "IDLE" | "BUSY" | "OFFLINE" | "ERROR";

export type MetricsRequest = {
  metric: MetricName;
  from: string;
  to: string;
  /** `1m`, `5m`, `1h`, `6h`, `1d`… mínimo 10s. */
  step: string;
  agg: Aggregation;
  filters?: Record<string, string>;
  group_by?: string[];
};

/** `points` son pares `[epochSegundos, valor]`, listos para graficar. */
export type Series = { labels: Record<string, string>; points: Array<[number, number]> };
export type MetricsResponse = { metric: string; unit: string; step: string; series: Series[] };

/**
 * Tope de rango de UNA consulta (MetricsQueryTranslator.MAX_RANGE = 31 días).
 *
 * No es un tope de historia: la retención de VictoriaMetrics es de ~400 días y
 * la semilla de demo carga un año entero. Lo que no se puede es pedir todo eso
 * en una sola llamada. Para graficar el año hay que encadenar consultas de a 31
 * días; hoy recortamos a 30 y lo avisamos, que alcanza para los períodos que
 * ofrece el PeriodPicker.
 */
export const MAX_METRICS_WINDOW_DAYS = 30;

/**
 * Por qué una consulta de métricas no devolvió datos.
 *
 * `forbidden` y `unavailable` se distinguen a propósito: el primero es el rol
 * del usuario y no se arregla solo, el segundo es VictoriaMetrics caído y el
 * resto del dashboard sigue vivo (`/query/*` no se entera).
 */
export type MetricsFailure = "forbidden" | "unavailable" | "error";

export type MetricsResult =
  | { ok: true; response: MetricsResponse; clamped: boolean }
  | { ok: false; reason: MetricsFailure; clamped: boolean };

/**
 * Recorta la ventana al máximo que una consulta puede abarcar.
 *
 * El PeriodPicker ofrece 90 días, que sirven contra Mongo pero acá serían un
 * `QUERY_TOO_BROAD`. Los datos existen — la retención es de ~400 días — pero no
 * entran en una sola llamada. Se recorta y se avisa, en vez de romper el panel.
 */
export function metricsWindow(bounds: { from: number; to: number }): {
  from: string;
  to: string;
  seconds: number;
  clamped: boolean;
} {
  const maxMs = MAX_METRICS_WINDOW_DAYS * 86_400_000;
  const clamped = bounds.to - bounds.from > maxMs;
  const fromMs = clamped ? bounds.to - maxMs : bounds.from;
  return {
    from: new Date(fromMs).toISOString(),
    to: new Date(bounds.to).toISOString(),
    seconds: (bounds.to - fromMs) / 1000,
    clamped,
  };
}

/**
 * Nunca tira: devuelve el motivo del fallo para que el panel degrade.
 *
 * Un 503 acá significa VictoriaMetrics caído y es el único error que no es culpa
 * del request. El contrato del backend es explícito en que hay que degradar los
 * gráficos de rovers y dejar el resto del dashboard funcionando.
 */
export async function metricsQuery(request: MetricsRequest): Promise<MetricsResult> {
  // Se chequea antes de pedir: /metrics/** contesta 403 seco, sin cuerpo de
  // error, así que preguntarle al servidor no daría más información que el rol
  // que ya tenemos guardado.
  if (!canReadFleetMetrics()) return { ok: false, reason: "forbidden", clamped: false };

  try {
    const res = await apiPost("/metrics/query", request);
    if (res.status === 503) return { ok: false, reason: "unavailable", clamped: false };
    if (res.status === 403) return { ok: false, reason: "forbidden", clamped: false };
    if (!res.ok) return { ok: false, reason: "error", clamped: false };
    const response = (await res.json()) as MetricsResponse;
    return { ok: true, response, clamped: false };
  } catch {
    return { ok: false, reason: "error", clamped: false };
  }
}

// ─── Helpers sobre series ──────────────────────────────────────────────────────

/** Suma de los valores de una serie. Para counters con `increase`: total del período. */
export function sumPoints(series: Series): number {
  return series.points.reduce((acc, [, v]) => acc + v, 0);
}

/**
 * Promedio de los valores de una serie.
 *
 * Sobre `wh.vehicle.state` con `agg: "avg"` esto da la fracción del período
 * (0..1) que un rover pasó en ese estado.
 */
export function avgPoints(series: Series): number {
  if (series.points.length === 0) return 0;
  return sumPoints(series) / series.points.length;
}

/** Indexa las series por el valor de una etiqueta, p.ej. `vehicle_id`. */
export function byLabel(series: Series[], label: string): Map<string, Series> {
  const map = new Map<string, Series>();
  for (const s of series) {
    const key = s.labels[label];
    if (key) map.set(key, s);
  }
  return map;
}

// ─── Las divisiones que son nuestras ───────────────────────────────────────────

/**
 * Tiempo promedio entre fallas, en segundos.
 *
 * `null` cuando no hubo ninguna falla — que es distinto de cero y distinto de
 * "no sé". Un rover sin fallas no tiene un MTBF de 0, no tiene MTBF.
 */
export function mtbfSeconds(failures: number, windowSeconds: number): number | null {
  return failures > 0 ? windowSeconds / failures : null;
}

/**
 * Tiempo promedio de recuperación, en segundos: tiempo total en falla dividido
 * por la cantidad de fallas.
 *
 * @param errorFraction fracción del período en el estado de falla (0..1), el
 *   promedio de `wh.vehicle.state` filtrado por ese estado.
 * @param failures tiene que venir del contador de transiciones, no de esta
 *   fracción: un rover apagado todo el período da fracción > 0 sin haber fallado
 *   nunca, y el `> 0 ? … : null` es lo único que lo distingue.
 */
export function mttrSeconds(
  failures: number,
  errorFraction: number,
  windowSeconds: number,
): number | null {
  return failures > 0 ? (errorFraction * windowSeconds) / failures : null;
}

/** Segundos → "48.6 h" / "18.7 min" / "45 s", para mostrar en un KPI. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)} min`;
  return `${Math.round(seconds)} s`;
}
