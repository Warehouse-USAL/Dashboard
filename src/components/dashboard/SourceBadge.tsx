import { AlertTriangle, FlaskConical, Lock } from "lucide-react";
import type { DataSource } from "@/lib/data-source";

const CONFIG: Record<Exclude<DataSource, "live">, { label: string; title: string; css: string }> = {
  mock: {
    label: "datos de ejemplo",
    title: "El backend no respondió. Esto es dato inventado, no del almacén.",
    css: "bg-warning/15 text-warning border-warning/30",
  },
  unavailable: {
    label: "métricas no disponibles",
    title: "El almacén de métricas (VictoriaMetrics) no está respondiendo.",
    css: "bg-destructive/15 text-destructive border-destructive/30",
  },
  forbidden: {
    label: "requiere permisos",
    title: "Tu rol no puede leer estos datos. Hace falta almacén o dashboard.",
    css: "bg-muted text-muted-foreground border-border",
  },
};

const ICONS = {
  mock: FlaskConical,
  unavailable: AlertTriangle,
  forbidden: Lock,
} as const;

/**
 * Chip que marca un dato que NO viene del backend.
 *
 * No renderiza nada cuando la fuente es "live", así que se puede dejar puesto
 * incondicionalmente en cualquier panel: sólo aparece cuando hay algo que
 * confesar. Ver data-source.ts para el porqué.
 */
export function SourceBadge({
  source,
  className = "",
}: {
  source: DataSource;
  className?: string;
}) {
  if (source === "live") return null;
  const { label, title, css } = CONFIG[source];
  const Icon = ICONS[source];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap ${css} ${className}`}
    >
      <Icon className="w-3 h-3 shrink-0" />
      {label}
    </span>
  );
}
