/**
 * De qué momento habla un dato, independiente de si vino del backend o no
 * (eso ya lo cubre `data-source.ts`). Tres respuestas posibles a "¿esto es
 * ahora, o es una ventana?":
 *
 * - `live`   — estado actual del almacén. No depende de ningún selector.
 * - `period` — agregado sobre el rango que el usuario elige en el picker de
 *   la página (24h/7d/30d/90d/custom).
 * - `risk-window` — agregado sobre la Ventana de riesgo de Configuración: no
 *   es "ahora mismo" (cambia si se toca esa config) pero tampoco es "el
 *   período de arriba" (no le hace caso al picker a propósito, para que un
 *   período corto no haga parpadear las alertas de riesgo). Merece su propio
 *   rótulo — decirle LIVE sería impreciso, y decirle el período de arriba
 *   sería directamente falso.
 */
export type Temporality =
  | { kind: "live" }
  | { kind: "period"; label: string }
  | { kind: "risk-window"; days: number };

export function live(): Temporality {
  return { kind: "live" };
}

export function period(label: string): Temporality {
  return { kind: "period", label };
}

export function riskWindow(days: number): Temporality {
  return { kind: "risk-window", days };
}
