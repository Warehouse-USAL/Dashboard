import { Calendar as CalendarIcon } from "lucide-react";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import type { PeriodId } from "@/lib/dateRange";

/**
 * Altura del encabezado global de `_dash.tsx` (`h-[61px]`). La barra del período se
 * pega justo debajo de él: con `top-0` quedaría escondida detrás del encabezado,
 * que es sticky y tiene mayor z-index.
 */
export const APP_HEADER_HEIGHT = 61;

/**
 * Barra del período de tiempo, pegada debajo del encabezado al hacer scroll, para
 * poder cambiar el período aunque se esté en el fondo de la página.
 *
 * Es translúcida con desenfoque: el contenido pasa por debajo sin cortarse en seco.
 * A la izquierda dice qué controla el selector, que sin contexto es sólo un botón con
 * una fecha.
 *
 * Importante: `sticky` sólo funciona si ningún ancestro entre la barra y la ventana
 * tiene `overflow` distinto de visible (por eso `<main>` de `_dash.tsx` usa
 * `overflow-x-clip` y no `overflow-auto`).
 */
export function StickyPeriodBar({
  value,
  onChange,
}: {
  value: PeriodId;
  onChange: (v: PeriodId) => void;
}) {
  return (
    <div
      className="sticky z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-background/85 backdrop-blur border-b border-border/60 flex items-center justify-between gap-2 text-xs"
      style={{ top: APP_HEADER_HEIGHT }}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <CalendarIcon className="w-3.5 h-3.5" />
        Período de análisis
      </span>
      <PeriodPicker value={value} onChange={onChange} />
    </div>
  );
}
