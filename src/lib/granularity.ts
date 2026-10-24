import type { PeriodId } from "./dateRange";
import { nextBucket, type BucketKind } from "./series-fill";

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

const MONTHS_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "21/10" para un instante, en hora de Buenos Aires (UTC-3). */
function dayMonth(epochSeconds: number): string {
  const d = new Date((epochSeconds - 3 * 3_600) * 1000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/**
 * Rango completo de una semana o un mes, para el tooltip: "Semana del 06/10 al
 * 12/10", "octubre 2026".
 *
 * Se recorta al período elegido, así la primera y la última semana (o mes) se
 * ven con los días que realmente tienen: si hoy es 21/10, la última semana dice
 * "del 20/10 al 21/10", y se entiende por qué ese punto es más bajo.
 */
export function bucketRangeLabel(
  start: number,
  kind: BucketKind,
  windowFromSeconds: number,
  windowToSeconds: number,
): string {
  const end = nextBucket(start, kind) - 1;
  const from = Math.max(start, windowFromSeconds);
  const to = Math.min(end, windowToSeconds);
  const range =
    dayMonth(from) === dayMonth(to) ? dayMonth(from) : `${dayMonth(from)} al ${dayMonth(to)}`;
  if (kind === "week") return `Semana del ${range}`;
  if (kind === "month") {
    const d = new Date((start - 3 * 3_600) * 1000);
    const name = `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    const partial = from > start || to < end;
    return partial ? `${name} (del ${range})` : name;
  }
  return dayMonth(from);
}

/** "oct 26" para el bucket mensual que empieza en `epochSeconds`. */
export function formatMonthStart(epochSeconds: number): string {
  // 3h de margen para leer el día 1 en hora de Buenos Aires (UTC-3) sin errores de zona.
  const d = new Date((epochSeconds - 3 * 3_600) * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}
