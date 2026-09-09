/**
 * De dónde salió un dato que se está mostrando.
 *
 * Existe porque el dashboard cae a datos mock cuando el backend falla (ver los
 * `catch → mock` de api.ts) y hasta ahora eso era indistinguible de un backend
 * sano: se veían órdenes, rovers con batería y gráficos llenos, y el único
 * indicio era un console.error que nadie mira. Un backend caído tiene que
 * *verse* caído.
 *
 * La decisión fue conservar los fallbacks — que la demo nunca quede en blanco —
 * pero obligando a que cada dato mock viaje etiquetado hasta la UI.
 */
export type DataSource =
  | "live" // del backend, dato real
  | "mock" // el backend falló y esto es dato de ejemplo
  | "unavailable" // el backend contestó que no puede (503 METRICS_UNAVAILABLE)
  | "forbidden"; // el rol del usuario no alcanza para leer esto

/** Un valor junto con su procedencia. */
export type Sourced<T> = { data: T; source: DataSource };

export function live<T>(data: T): Sourced<T> {
  return { data, source: "live" };
}

export function mock<T>(data: T): Sourced<T> {
  return { data, source: "mock" };
}

export function unavailable<T>(data: T): Sourced<T> {
  return { data, source: "unavailable" };
}

export function forbidden<T>(data: T): Sourced<T> {
  return { data, source: "forbidden" };
}

/**
 * Procedencia de un panel que combina varias fuentes.
 *
 * Se queda con la peor, no con la más común: un panel que mezcla una serie real
 * con una inventada no es "casi real". Orden de gravedad: forbidden, unavailable,
 * mock, live.
 */
export function worstSource(sources: readonly DataSource[]): DataSource {
  if (sources.includes("forbidden")) return "forbidden";
  if (sources.includes("unavailable")) return "unavailable";
  if (sources.includes("mock")) return "mock";
  return "live";
}
