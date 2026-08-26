import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

export type PeriodId = "24h" | "7d" | "30d" | "90d" | "custom";

export const PERIOD_OPTIONS: Array<{ id: PeriodId; label: string }> = [
  { id: "24h", label: "Últimas 24 horas" },
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "90d", label: "Últimos 90 días" },
  { id: "custom", label: "Rango personalizado" },
];

/** Etiqueta legible del período/rango seleccionado, para mostrar junto al picker. */
export function periodLabel(value: PeriodId, range?: DateRange): string {
  if (value === "custom") {
    if (range?.from && range?.to)
      return `${format(range.from, "dd/MM/yy")} – ${format(range.to, "dd/MM/yy")}`;
    if (range?.from) return `Desde ${format(range.from, "dd/MM/yy")}`;
    return "Rango personalizado";
  }
  return PERIOD_OPTIONS.find((p) => p.id === value)!.label;
}

const PERIOD_DAYS: Record<Exclude<PeriodId, "custom">, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/**
 * Resolves a period selector (+ optional custom range) into concrete [from, to]
 * bounds in ms since epoch. Falls back to 30d when "custom" is picked but the
 * range isn't complete yet, so the view never goes blank mid-selection.
 */
export function periodToBounds(period: PeriodId, custom?: DateRange): { from: number; to: number } {
  const now = Date.now();
  if (period === "custom") {
    if (custom?.from && custom?.to) {
      const from = new Date(custom.from);
      from.setHours(0, 0, 0, 0);
      const to = new Date(custom.to);
      to.setHours(23, 59, 59, 999);
      return { from: from.getTime(), to: to.getTime() };
    }
    return { from: now - 30 * 86_400_000, to: now };
  }
  return { from: now - PERIOD_DAYS[period] * 86_400_000, to: now };
}

/** True if the ISO timestamp falls within [from, to]. False for missing/unparseable dates. */
export function withinBounds(
  iso: string | undefined,
  bounds: { from: number; to: number },
): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t >= bounds.from && t <= bounds.to;
}
