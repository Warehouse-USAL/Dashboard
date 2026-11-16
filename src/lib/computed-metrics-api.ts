/**
 * Cliente de las métricas calculadas del backend (`POST /metrics/<nombre>`).
 *
 * A diferencia de `/metrics/query` (series crudas de VictoriaMetrics), estas las
 * calcula el backend sobre Mongo y devuelven una fila por intervalo ya sumada. Hoy
 * se usa una sola: `suggestion-conversion`.
 */
import { apiPost } from "./api";
import type { BucketKind } from "./series-fill";

/** Zona con la que el backend corta los intervalos (UTC si se omite): la misma que el resto de la app. */
export const METRICS_TIME_ZONE = "America/Argentina/Buenos_Aires";

/** El backend sólo agrupa por día, semana (lunes a domingo) o mes: no existe la hora. */
export type ConversionGranularity = "day" | "week" | "month";

/**
 * Un intervalo de `suggestion-conversion`.
 *
 * Los tres pares miden lo mismo con una vara distinta: pedidos (basta una línea
 * recomendada para que el pedido cuente), líneas (un producto dentro de un pedido,
 * sin importar la cantidad) y unidades (la cantidad pedida de cada producto). Todo sobre pedidos NO
 * cancelados, por fecha de creación. Las tasas `*_conversion_rate` vienen
 * redondeadas a 4 decimales y valen 0 cuando no hay pedidos: se recalculan desde
 * los conteos.
 */
export type ConversionBucket = {
  /** "YYYY-MM-DD": el día, el lunes de la semana o el día 1 del mes. */
  bucket: string;
  orders: number;
  orders_with_recommendation: number;
  lines: number;
  lines_from_recommendation: number;
  units: number;
  units_from_recommendation: number;
};

export type SuggestionConversionResponse = {
  metric: string;
  params_used: Record<string, unknown>;
  generated_at: string;
  data: ConversionBucket[];
};

/** Error con el `code` del backend (p. ej. `INVALID_METRIC_PARAMS`) y el estado HTTP. */
export class ComputedMetricError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ComputedMetricError";
  }
}

/** Los períodos de hora no existen acá: el intervalo más fino que ofrece el backend es el día. */
export function conversionGranularity(kind: BucketKind): ConversionGranularity {
  return kind === "hour" ? "day" : kind;
}

export async function fetchSuggestionConversion(params: {
  from: string;
  to: string;
  granularity: ConversionGranularity;
}): Promise<ConversionBucket[]> {
  const res = await apiPost("/metrics/suggestion-conversion", {
    params: { ...params, time_zone: METRICS_TIME_ZONE },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ComputedMetricError(
      body?.error?.code ?? "HTTP_ERROR",
      body?.error?.message ?? `HTTP ${res.status}`,
      res.status,
    );
  }
  return ((await res.json()) as SuggestionConversionResponse).data;
}

export type ConversionTotals = {
  orders: number;
  ordersWithRecommendation: number;
  lines: number;
  linesFromRecommendation: number;
  units: number;
  unitsFromRecommendation: number;
};

export function sumConversion(buckets: ConversionBucket[]): ConversionTotals {
  const totals: ConversionTotals = {
    orders: 0,
    ordersWithRecommendation: 0,
    lines: 0,
    linesFromRecommendation: 0,
    units: 0,
    unitsFromRecommendation: 0,
  };
  for (const b of buckets) {
    totals.orders += b.orders;
    totals.ordersWithRecommendation += b.orders_with_recommendation;
    totals.lines += b.lines;
    totals.linesFromRecommendation += b.lines_from_recommendation;
    totals.units += b.units;
    totals.unitsFromRecommendation += b.units_from_recommendation;
  }
  return totals;
}

/**
 * Parte sobre el total, en %. `null` y no 0 cuando no hay nada que medir: "0 % de
 * adopción" y "no hubo pedidos" son afirmaciones distintas.
 */
export function ratePct(part: number, total: number): number | null {
  return total > 0 ? (part / total) * 100 : null;
}
