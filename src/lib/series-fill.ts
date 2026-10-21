/**
 * Relleno de intervalos para los gráficos de series de tiempo.
 *
 * Mongo (`group_by` por fecha) y VictoriaMetrics sólo devuelven los intervalos en
 * los que pasó algo: una hora o un día sin órdenes no vuelve como 0, directamente
 * no vuelve. Graficar eso tal cual hace que el eje termine en el último dato en
 * vez de en el final del período elegido, y que los huecos del medio desaparezcan.
 * Estas funciones arman la grilla completa para que los gráficos la rellenen con 0.
 */

// Los buckets de `/query/*` vienen en hora de Buenos Aires, sin zona ni horario
// de verano (UTC-3 todo el año).
const BA_OFFSET_MS = 3 * 3_600_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type BucketKind = "hour" | "day";

/**
 * Claves de bucket ("2026-08-01T19:00:00" o "2026-08-01") de todas las horas o
 * días entre `from` y `to`, en hora de Buenos Aires y en orden cronológico.
 *
 * Mismo formato que devuelve el backend, así se pueden cruzar por igualdad.
 */
export function bucketKeys(from: Date, to: Date, kind: BucketKind): string[] {
  const size = kind === "hour" ? HOUR_MS : DAY_MS;
  // Desplazando -3h, los getters UTC de un Date leen la hora de Buenos Aires.
  const start = Math.floor((from.getTime() - BA_OFFSET_MS) / size) * size;
  const end = to.getTime() - BA_OFFSET_MS;
  const keys: string[] = [];
  for (let t = start; t <= end; t += size) {
    const iso = new Date(t).toISOString();
    keys.push(kind === "hour" ? iso.slice(0, 19) : iso.slice(0, 10));
  }
  return keys;
}

/**
 * Cruza los buckets devueltos con la grilla completa del período: los intervalos
 * sin datos quedan en 0. Un bucket que no esté en la grilla (borde de la
 * ventana) se conserva en vez de descartarse en silencio.
 */
export function fillBuckets<T extends { bucket: string; orders: number }>(
  rows: T[],
  keys: string[],
  kind: BucketKind,
): Array<{ bucket: string; orders: number }> {
  const len = kind === "hour" ? 19 : 10;
  const byKey = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const r of rows) {
    const key = r.bucket.slice(0, len);
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
  const start = anchorSeconds - Math.floor((anchorSeconds - fromSeconds) / stepSeconds) * stepSeconds;
  const grid: number[] = [];
  for (let t = start; t <= toSeconds; t += stepSeconds) grid.push(t);
  return grid;
}
