import type { PeriodId } from "./dateRange";
import type { BucketKind } from "./series-fill";

/**
 * Agrupación de los gráficos de series de tiempo según el período elegido.
 *
 * Una sola tabla para Órdenes por hora/día, Histórico de fallas y Actividad de
 * la flota, así todos los gráficos de una misma página cambian de escala juntos
 * y ninguno pasa de ~30 puntos.
 *
 * | Período   | Agrupación | Puntos |
 * | 24 horas  | hora       | 24     |
 * | 7 días    | día        | 7      |
 * | 30 días   | día        | 30     |
 * | 90 días   | semana     | 13     |
 * | 1 año     | mes        | 12     |
 */
const GRANULARITY: Record<PeriodId, BucketKind> = {
  "24h": "hour",
  "7d": "day",
  "30d": "day",
  "90d": "week",
  "1y": "month",
};

export function granularityFor(period: PeriodId): BucketKind {
  return GRANULARITY[period];
}

/** Paso que se le pide a `/metrics/query`. Semana y mes se arman acá sumando días. */
export function metricsStepFor(kind: BucketKind): "1h" | "1d" {
  return kind === "hour" ? "1h" : "1d";
}

/** Título del gráfico de órdenes según su agrupación. */
export function ordersChartTitle(kind: BucketKind): string {
  if (kind === "hour") return "Órdenes por hora";
  if (kind === "day") return "Órdenes por día";
  if (kind === "week") return "Órdenes por semana";
  return "Órdenes por mes";
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "oct 26" para el bucket mensual que empieza en `epochSeconds`. */
export function formatMonthStart(epochSeconds: number): string {
  // 3h de margen para leer el día 1 en hora de Buenos Aires (UTC-3) sin errores de zona.
  const d = new Date((epochSeconds - 3 * 3_600) * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}
