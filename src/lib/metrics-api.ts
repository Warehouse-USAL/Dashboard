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
 * Tope de rango de UNA consulta que le imponemos al backend.
 *
 * El backend ya no limita a 31 días: se probó con consultas de sólo lectura y
 * acepta al menos 730 días a paso diario (siempre que no pase el tope de puntos
 * por serie, ~11 000). Dejamos 365 porque es lo máximo que ofrece el
 * PeriodPicker ("Último año") y sirve de red de seguridad ante un cambio futuro.
 */
export const MAX_METRICS_WINDOW_DAYS = 365;

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
 * Con los períodos fijos del PeriodPicker (máximo 1 año) nunca se recorta; queda
 * como red de seguridad. Se recorta y se avisa, en vez de romper el panel.
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

/** `"1h"`, `"6h"`, `"1d"` → segundos. Sólo las unidades que acepta `step`. */
export function stepToSeconds(step: string): number {
  const match = /^(\d+)([smhd])$/.exec(step.trim());
  if (!match) return 3600;
  const unit = { s: 1, m: 60, h: 3600, d: 86_400 }[match[2]] ?? 3600;
  return Number(match[1]) * unit;
}

/**
 * Etiqueta de un instante, con el detalle que el paso justifica.
 *
 * Con paso diario la hora es ruido: repetir "03:37 p.m." en cada tick de un
 * gráfico de 30 días satura el eje sin informar nada.
 */
export function formatInstant(epochSeconds: number, stepSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  if (stepSeconds >= 86_400) {
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  }
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Segundos → "48.6 h" / "18.7 min" / "45 s", para mostrar en un KPI. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)} h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)} min`;
  return `${Math.round(seconds)} s`;
}
