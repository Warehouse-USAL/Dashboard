/**
 * URL de la página externa de monitoreo de vehículos (la expone infra, solo en la
 * red de la facultad).
 *
 * En producción la entrega el servidor: al arrancar, docker-entrypoint.sh escribe
 * `config.json` con el valor de MONITOREO_URL, así se cambia con el .env sin recompilar.
 * En desarrollo ese archivo no existe y se usa VITE_MONITOREO_URL de .env.local.
 */

/** Devuelve la URL normalizada si es http(s) válida; null si falta o es otra cosa. */
export function parseMonitoreoUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function loadMonitoreoUrl(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { monitoreoUrl?: unknown };
      const url = parseMonitoreoUrl(body.monitoreoUrl);
      if (url) return url;
    }
  } catch {
    // Sin config.json (dev) o sin JSON válido: se cae al valor de build.
  }
  return parseMonitoreoUrl(import.meta.env.VITE_MONITOREO_URL as string | undefined);
}
