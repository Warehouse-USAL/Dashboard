/**
 * Agrupación y relleno de intervalos para los gráficos de series de tiempo.
 *
 * Mongo (`group_by` por fecha) y VictoriaMetrics sólo devuelven los intervalos en
 * los que pasó algo: una hora o un día sin órdenes no vuelve como 0, directamente
 * no vuelve. Graficar eso tal cual hace que el eje termine en el último dato en
 * vez de en el final del período elegido, y que los huecos del medio desaparezcan.
 * Estas funciones arman la grilla completa para que los gráficos la rellenen con 0.
 *
 * El backend no agrupa por semana ni por mes calendario en métricas, así que esas
 * agrupaciones se arman acá a partir de datos por día.
 */

// Los buckets de `/query/*` vienen en hora de Buenos Aires, sin zona ni horario
// de verano (UTC-3 todo el año).
const BA_OFFSET_S = 3 * 3_600;
const HOUR_S = 3_600;
const DAY_S = 86_400;

export type BucketKind = "hour" | "day" | "week" | "month";

/**
 * Inicio (epoch en segundos) del intervalo de Buenos Aires que contiene a `t`.
 * La semana empieza el lunes; el mes, el día 1.
 */
export function bucketStart(t: number, kind: BucketKind): number {
  const local = t - BA_OFFSET_S; // los getters UTC de `local` leen hora de Buenos Aires
  if (kind === "hour") return Math.floor(local / HOUR_S) * HOUR_S + BA_OFFSET_S;
  const dayStart = Math.floor(local / DAY_S) * DAY_S;
  if (kind === "day") return dayStart + BA_OFFSET_S;
  if (kind === "week") {
    // El día 0 del epoch (01/01/1970) fue jueves: (día + 3) % 7 = días desde el lunes.
    const sinceMonday = (Math.floor(local / DAY_S) + 3) % 7;
    return dayStart - sinceMonday * DAY_S + BA_OFFSET_S;
  }
  const d = new Date(local * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000 + BA_OFFSET_S;
}

/** Inicio del intervalo siguiente al que empieza en `start`. */
export function nextBucket(start: number, kind: BucketKind): number {
  if (kind === "hour") return start + HOUR_S;
  if (kind === "day") return start + DAY_S;
  if (kind === "week") return start + 7 * DAY_S;
  const d = new Date((start - BA_OFFSET_S) * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000 + BA_OFFSET_S;
}

/**
 * Clave de un intervalo con el mismo formato que devuelve el backend:
 * "2026-08-01T19:00:00" (hora) o "2026-08-01" (día, lunes de la semana, o día 1 del mes).
 */
export function bucketKey(start: number, kind: BucketKind): string {
  const iso = new Date((start - BA_OFFSET_S) * 1000).toISOString();
  return kind === "hour" ? iso.slice(0, 19) : iso.slice(0, 10);
}

/** Epoch en segundos de un bucket del backend ("2026-08-01" o "2026-08-01T19:00:00"), hora de Buenos Aires. */
function backendBucketToEpoch(bucket: string): number {
  const [date, time = "00:00:00"] = bucket.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm, ss] = time.slice(0, 8).split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh || 0, mm || 0, ss || 0) / 1000 + BA_OFFSET_S;
}

/** Claves de todos los intervalos entre `from` y `to`, en orden cronológico. */
export function bucketKeys(from: Date, to: Date, kind: BucketKind): string[] {
  const keys: string[] = [];
  const end = to.getTime() / 1000;
  for (let t = bucketStart(from.getTime() / 1000, kind); t <= end; t = nextBucket(t, kind)) {
    keys.push(bucketKey(t, kind));
  }
  return keys;
}

/**
 * Cruza los buckets devueltos con la grilla completa del período, sumándolos al
 * intervalo (hora, día, semana o mes) que les corresponde. Los intervalos sin
 * datos quedan en 0. Un bucket fuera de la grilla se conserva en vez de
 * descartarse en silencio.
 */
export function fillBuckets<T extends { bucket: string; orders: number }>(
  rows: T[],
  keys: string[],
  kind: BucketKind,
): Array<{ bucket: string; orders: number }> {
  const byKey = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const r of rows) {
    const key = bucketKey(bucketStart(backendBucketToEpoch(r.bucket), kind), kind);
    byKey.set(key, (byKey.get(key) ?? 0) + r.orders);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, orders]) => ({ bucket, orders }));
}

/**
 * Instantes (epoch en segundos) equiespaciados por `stepSeconds` que cubren
 * [fromSeconds, toSeconds].
 *
 * `anchorSeconds` es un instante que el backend ya devolvió: la grilla se alinea
 * a él para coincidir exactamente con los puntos reales, sea cual sea la
 * alineación que use el servidor. Sin ancla (la serie vino vacía) devuelve [],
 * así el panel muestra su estado vacío en vez de un gráfico plano en cero.
 */
export function stepGrid(
  fromSeconds: number,
  toSeconds: number,
  stepSeconds: number,
  anchorSeconds: number | undefined,
): number[] {
  if (anchorSeconds === undefined || stepSeconds <= 0) return [];
  const start =
    anchorSeconds - Math.floor((anchorSeconds - fromSeconds) / stepSeconds) * stepSeconds;
  const grid: number[] = [];
  for (let t = start; t <= toSeconds; t += stepSeconds) grid.push(t);
  return grid;
}

/** Inicios de todas las semanas o meses entre `fromSeconds` y `toSeconds`. */
export function calendarGrid(
  fromSeconds: number,
  toSeconds: number,
  kind: "week" | "month",
  hasData: boolean,
): number[] {
  if (!hasData) return [];
  const grid: number[] = [];
  for (let t = bucketStart(fromSeconds, kind); t <= toSeconds; t = nextBucket(t, kind)) {
    grid.push(t);
  }
  return grid;
}

/**
 * Agrupa puntos `[epoch, valor]` por semana o mes. `sum` suma (fallas) y `avg`
 * promedia sobre los días del intervalo que caen dentro de la ventana, no sobre
 * los puntos presentes: un día sin rovers ocupados no trae punto pero cuenta
 * como 0, si no el promedio quedaría inflado.
 */
export function aggregatePoints(
  points: Array<[number, number]>,
  kind: "week" | "month",
  mode: "sum" | "avg",
  windowFrom: number,
  windowTo: number,
): Map<number, number> {
  const sums = new Map<number, number>();
  for (const [t, v] of points) {
    const start = bucketStart(t, kind);
    sums.set(start, (sums.get(start) ?? 0) + v);
  }
  if (mode === "sum") return sums;
  const out = new Map<number, number>();
  for (const [start, total] of sums) {
    const from = Math.max(start, windowFrom);
    const to = Math.min(nextBucket(start, kind), windowTo);
    const days = Math.max(1, Math.round((to - from) / DAY_S));
    out.set(start, total / days);
  }
  return out;
}
