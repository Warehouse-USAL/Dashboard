import { Calendar, Gauge, Radio } from "lucide-react";
import type { Temporality } from "@/lib/temporality";

/**
 * Rótulo de "a qué momento se refiere este dato" — LIVE, un período elegido, o
 * la Ventana de riesgo de Configuración. Independiente de `SourceBadge`, que
 * responde una pregunta distinta (¿esto vino del backend?); un panel puede
 * llevar los dos a la vez: en vivo pero mockeado, por ejemplo.
 */
export function TemporalBadge({
  value,
  className = "",
}: {
  value: Temporality;
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap";

  if (value.kind === "live") {
    return (
      <span
        title="Estado actual del almacén, no depende de ningún filtro de fecha."
        className={`${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-500 ${className}`}
      >
        <Radio className="w-3 h-3 shrink-0" />
        LIVE
      </span>
    );
  }

  if (value.kind === "period") {
    return (
      <span
        title="Agregado sobre el período elegido arriba."
        className={`${base} border-border bg-secondary/40 text-muted-foreground ${className}`}
      >
        <Calendar className="w-3 h-3 shrink-0" />
        {value.label}
      </span>
    );
  }

  return (
    <span
      title="Agregado sobre la Ventana de riesgo configurada en Configuración — no depende del período elegido arriba."
      className={`${base} border-amber-500/30 bg-amber-500/10 text-amber-500 ${className}`}
    >
      <Gauge className="w-3 h-3 shrink-0" />
      Ventana de riesgo: {value.days}d
    </span>
  );
}
