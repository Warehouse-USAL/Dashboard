import { Calendar, Clock, Gauge, Radio } from "lucide-react";
import type { Temporality } from "@/lib/temporality";

/**
 * Rótulo de "a qué momento se refiere este dato" — LIVE, un período elegido, la
 * corrida diaria del cron de reposición o su ventana fija de demanda.
 * Independiente de `SourceBadge`, que
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

  if (value.kind === "daily-run") {
    return (
      <span
        title="Recomendación que el backend calcula una vez por día. Es una foto: no se mueve con el stock en vivo."
        className={`${base} border-sky-500/30 bg-sky-500/10 text-sky-500 ${className}`}
      >
        <Clock className="w-3 h-3 shrink-0" />
        Cron diario
      </span>
    );
  }

  return (
    <span
      title="Agregado sobre la ventana fija de demanda del cron de reposición. No es configurable ni depende del período elegido arriba."
      className={`${base} border-amber-500/30 bg-amber-500/10 text-amber-500 ${className}`}
    >
      <Gauge className="w-3 h-3 shrink-0" />
      Últimos {value.days}d
    </span>
  );
}
