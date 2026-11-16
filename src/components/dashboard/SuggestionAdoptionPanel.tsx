import { Sparkles } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/dashboard/Panel";
import { ChartBox } from "@/components/dashboard/ChartBox";
import { SourceBadge } from "@/components/dashboard/SourceBadge";
import { TemporalBadge } from "@/components/dashboard/TemporalBadge";
import { useSuggestionAdoption, type AdoptionPoint } from "@/hooks/useSuggestionAdoption";
import { periodLabel, type PeriodId } from "@/lib/dateRange";
import { period as periodTemporal } from "@/lib/temporality";

const COLORS = {
  orders: "oklch(0.78 0.18 180)",
  lines: "oklch(0.78 0.18 80)",
  units: "oklch(0.72 0.18 50)",
} as const;

// Explicaciones de las tres tasas, con un caso real: la orden o-24955 del backend
// tiene 2 productos (mouse ×1, auriculares ×3) y los auriculares fueron recomendados.
const EXAMPLE =
  "Ejemplo real: la orden o-24955 tiene 2 productos (mouse ×1 y auriculares ×3) y los " +
  "auriculares venían de una recomendación → cuenta como 1 pedido con recomendación, " +
  "1 de 2 productos (50 %) y 3 de 4 unidades (75 %).";
const HINTS = {
  orders:
    "Pedidos que usaron una recomendación. Alcance: basta con que UN producto del pedido " +
    "venga de una sugerencia para que el pedido cuente, por eso es siempre la tasa más alta " +
    "y no significa que ese porcentaje de lo pedido fuera recomendado.\n\n" +
    EXAMPLE,
  lines:
    "Productos pedidos que eran recomendados. Cuenta cada producto distinto dentro de un " +
    "pedido una sola vez, sin importar la cantidad (en el backend: «líneas»). Es la que mejor " +
    "refleja cuánto de lo que se elige viene de sugerencias.\n\n" +
    EXAMPLE,
  units:
    "Unidades pedidas que eran recomendadas. Cuenta cada unidad de producto, o sea la " +
    "cantidad pedida de cada uno (en el backend: «units»), así que pesa más un producto " +
    "que se pide en cantidad.\n\n" +
    EXAMPLE,
} as const;

function fmtPct(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtInt(n: number): string {
  return n.toLocaleString("es-AR");
}

function AdoptionCard({
  title,
  pct,
  detail,
  color,
  hint,
}: {
  title: string;
  pct: number | null;
  detail: string;
  color: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3 cursor-help" title={hint}>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: color }} />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <p className="text-2xl font-bold tabular-nums">{fmtPct(pct)}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{detail}</p>
    </div>
  );
}

/** Tooltip del gráfico: las tres tasas del intervalo con los conteos que las explican. */
function AdoptionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: AdoptionPoint }>;
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const c = p.counts;
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-[11px] shadow-md space-y-1">
      <p className="font-semibold">{p.range ?? p.label}</p>
      <p style={{ color: COLORS.orders }}>
        Pedidos: {fmtPct(p.ordersPct)} ({fmtInt(c.orders_with_recommendation)} de {fmtInt(c.orders)}
        )
      </p>
      <p style={{ color: COLORS.lines }}>
        Productos: {fmtPct(p.linesPct)} ({fmtInt(c.lines_from_recommendation)} de {fmtInt(c.lines)})
      </p>
      <p style={{ color: COLORS.units }}>
        Unidades: {fmtPct(p.unitsPct)} ({fmtInt(c.units_from_recommendation)} de {fmtInt(c.units)})
      </p>
    </div>
  );
}

/**
 * Adopción de las recomendaciones de la app móvil (`POST /metrics/suggestion-conversion`).
 *
 * Se llama "adopción" y no "conversión" a propósito: el backend no guarda cuántas
 * recomendaciones se mostraron, así que no se puede medir cuántas se aceptaron sobre
 * las mostradas. Lo que sí se mide es qué parte de lo pedido vino marcado como
 * recomendado por la app (marca declarada por el cliente, no verificada).
 */
export function SuggestionAdoptionPanel({ period }: { period: PeriodId }) {
  const adoption = useSuggestionAdoption(period);
  const t = adoption.totals;

  return (
    <Panel
      dense
      title="Adopción de recomendaciones · app móvil"
      subtitle="Qué parte de lo pedido vino de una sugerencia"
      icon={Sparkles}
      action={
        <div className="flex items-center gap-2">
          <TemporalBadge value={periodTemporal(periodLabel(period))} />
          <SourceBadge source={adoption.source} />
        </div>
      }
      expandable
    >
      {(expanded) => (
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="flex flex-col gap-3">
              <AdoptionCard
                title="Pedidos que usaron una recomendación"
                pct={adoption.ordersPct}
                detail={`${fmtInt(t.ordersWithRecommendation)} de ${fmtInt(t.orders)} pedidos`}
                color={COLORS.orders}
                hint={HINTS.orders}
              />
              <AdoptionCard
                title="Productos pedidos que eran recomendados"
                pct={adoption.linesPct}
                detail={`${fmtInt(t.linesFromRecommendation)} de ${fmtInt(t.lines)} productos pedidos`}
                color={COLORS.lines}
                hint={HINTS.lines}
              />
              <AdoptionCard
                title="Unidades pedidas que eran recomendadas"
                pct={adoption.unitsPct}
                detail={`${fmtInt(t.unitsFromRecommendation)} de ${fmtInt(t.units)} unidades`}
                color={COLORS.units}
                hint={HINTS.units}
              />
            </div>

            <div className="lg:col-span-2">
              {adoption.hasEvolution ? (
                <ChartBox height={expanded ? 380 : 270}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={adoption.points}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: expanded ? 13 : 10 }}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={(v: number) => `${v}%`}
                        tick={{ fontSize: expanded ? 13 : 10 }}
                        stroke="var(--muted-foreground)"
                      />
                      <Tooltip content={<AdoptionTooltip />} />
                      <Legend wrapperStyle={{ fontSize: expanded ? 13 : 10 }} />
                      <Line
                        type="monotone"
                        dataKey="ordersPct"
                        name="Pedidos"
                        stroke={COLORS.orders}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="linesPct"
                        name="Productos"
                        stroke={COLORS.lines}
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="unitsPct"
                        name="Unidades"
                        stroke={COLORS.units}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartBox>
              ) : (
                <div className="h-full min-h-[120px] flex items-center justify-center rounded-lg border border-dashed border-border">
                  <p className="text-[11px] text-muted-foreground text-center px-4">
                    {adoption.isLoading
                      ? "Cargando…"
                      : "Con un período de 24 horas no hay evolución para mostrar. Elegí 7 días o más."}
                  </p>
                </div>
              )}
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Cuenta los pedidos creados en el período que no estén cancelados (pendientes, en curso y
            completados), por eso el total puede ser menor que «Órdenes totales», que sí incluye las
            canceladas.
          </p>
        </div>
      )}
    </Panel>
  );
}
