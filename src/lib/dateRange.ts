export type PeriodId = "24h" | "7d" | "30d" | "90d" | "1y";

export const PERIOD_OPTIONS: Array<{ id: PeriodId; label: string }> = [
  { id: "24h", label: "Últimas 24 horas" },
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "90d", label: "Últimos 90 días" },
  { id: "1y", label: "Último año" },
];

/** Etiqueta legible del período seleccionado, para mostrar junto al picker. */
export function periodLabel(value: PeriodId): string {
  return PERIOD_OPTIONS.find((p) => p.id === value)!.label;
}

export const PERIOD_DAYS: Record<PeriodId, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

/** Resolves a period selector into concrete [from, to] bounds in ms since epoch. */
export function periodToBounds(period: PeriodId): { from: number; to: number } {
  const now = Date.now();
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
