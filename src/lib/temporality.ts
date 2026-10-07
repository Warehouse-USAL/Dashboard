/**
 * De qué momento habla un dato, independiente de si vino del backend o no
 * (eso ya lo cubre `data-source.ts`). Tres respuestas posibles a "¿esto es
 * ahora, o es una ventana?":
 *
 * - `live`   — estado actual del almacén. No depende de ningún selector.
 * - `period` — agregado sobre el rango que el usuario elige en el picker de
 *   la página (24h/7d/30d/90d/custom).
 * - `daily-run` — foto que el backend calcula una vez por día (cron de
 *   reposición): no se mueve con el stock en vivo ni con el picker.
 * - `restock-window` — agregado sobre la ventana fija de demanda del cron de
 *   reposición. No es configurable y no le hace caso al picker a propósito,
 *   para que un período corto no haga parpadear las alertas. Decirle LIVE
 *   sería impreciso, y decirle el período de arriba sería directamente falso.
 */
export type Temporality =
  | { kind: "live" }
  | { kind: "period"; label: string }
  | { kind: "daily-run" }
  | { kind: "restock-window"; days: number };

export function live(): Temporality {
  return { kind: "live" };
}

export function period(label: string): Temporality {
  return { kind: "period", label };
}

export function dailyRun(): Temporality {
  return { kind: "daily-run" };
}

export function restockWindow(days: number): Temporality {
  return { kind: "restock-window", days };
}
