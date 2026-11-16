import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  DollarSign,
  HeartPulse,
  LayoutDashboard,
  Package,
  Target,
  Truck,
  Warehouse,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel, PageHeader } from "@/components/dashboard/Panel";
import { ChartBox } from "@/components/dashboard/ChartBox";
import { batteryTone, stateStyles } from "@/lib/dashboard-data";
import { useQuery } from "@tanstack/react-query";
import { getAllPositions } from "@/lib/api";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleWebSocket } from "@/hooks/useVehicleWebSocket";
import { useActiveOrders } from "@/hooks/useOrders";
import { useOrderStats } from "@/hooks/useOrderStats";
import { useProducts } from "@/hooks/useProducts";
import { useInventoryMetrics } from "@/hooks/useInventoryMetrics";
import { useFleetMetrics } from "@/hooks/useFleetMetrics";
import { formatDuration } from "@/lib/metrics-api";
import { periodLabel, type PeriodId } from "@/lib/dateRange";
import { usePagedList } from "@/hooks/usePagination";
import { TablePagination } from "@/components/dashboard/TablePagination";
import { PeriodPicker } from "@/components/dashboard/PeriodPicker";
import { TemporalBadge } from "@/components/dashboard/TemporalBadge";
import { SourceBadge } from "@/components/dashboard/SourceBadge";
import { useHomeCharts } from "@/hooks/useHomeCharts";
import { ordersByBucketTitle, pickingSubtitle } from "@/lib/granularity";
import { live, period as periodTemporal } from "@/lib/temporality";
import type { Temporality } from "@/lib/temporality";
import { worstSource, type DataSource } from "@/lib/data-source";

export const Route = createFileRoute("/_dash/home")({
  component: HomePage,
  head: () => ({ meta: [{ title: "Home · SmartWarehouse" }] }),
});

const tooltip = {
  contentStyle: {
    background: "oklch(0.22 0.025 250)",
    border: "1px solid oklch(0.32 0.025 250)",
    borderRadius: 8,
    fontSize: 12,
  },
  itemStyle: { color: "#ffffff" },
  labelStyle: { color: "#ffffff" },
};

// useOrderStats() exige un umbral de SLA aunque Home no muestre slaPct — sólo
// se usa para esa consulta interna que acá no se lee. Mismo valor que Órdenes
// (_dash.ordenes-v2.tsx), para no inventar un segundo número sin sentido.
const SLA_MINUTES = 5;

// Cuántos SKUs lista el panel (y cuánto dice su título). Con 5 filas queda de una
// altura parecida a "Estado de rovers" con la flota de la demo (6 rovers).
const TOP_SKUS_COUNT = 5;

function HomePage() {
  const { data: rovers } = useVehicles();
  const {
    page: roversPage,
    setPage: setRoversPage,
    totalPages: roversTotalPages,
    pageItems: pagedRovers,
    from: roversFrom,
    to: roversTo,
    total: roversTotal,
  } = usePagedList(rovers, 10);
  // Sólo para "Órdenes en proceso": useOrders() sin status traía una página
  // de 50 sin orden garantizado, y una orden activa nueva podía quedar
  // fuera. Ver getActiveOrders() en lib/api.ts.
  const { data: activeOrders } = useActiveOrders();
  const { data: products } = useProducts();
  const [period, setPeriod] = useState<PeriodId>("7d");
  // Same underlying calc as Inventario's "Top rotación" (useInventoryMetrics,
  // dailyDemand acotado por período) — antes esto era un conteo aparte sobre
  // órdenes sin filtrar por fecha, así que nunca iba a coincidir con Inventario.
  const { products: enrichedProducts } = useInventoryMetrics(period);
  // Mismo hook que usa Vehículos — así MTBF coincide entre las dos páginas en
  // vez de que Home muestre "sin datos" mientras Vehículos sí tiene el número.
  const fleet = useFleetMetrics(period);
  // Mismo hook que usa Órdenes para "Tasa de cumplimiento" — antes Home
  // recalculaba lo mismo a mano sobre useOrders() (capado a 50, sin orden
  // garantizado) y encima devolvía "100%" cuando no había datos en vez de
  // "sin datos". Reusarlo hace que el número coincida entre las dos páginas
  // y hereda el fallback correcto (compliancePct === null).
  const stats = useOrderStats(period, SLA_MINUTES * 60_000);
  const { data: positions = [] } = useQuery({
    queryKey: ["warehouse-positions"],
    queryFn: getAllPositions,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  useVehicleWebSocket();
  // Completadas por intervalo: las mismas que el gráfico de Órdenes (stats.hourly);
  // canceladas y unidades despachadas se piden aparte.
  const charts = useHomeCharts(period, stats.hourly);
  const chartsSource = worstSource([stats.source, charts.source]);

  const ocupacionAlmacen = useMemo(() => {
    const totalStock = positions.reduce((s, p) => s + p.current_stock, 0);
    const totalCapacity = positions.reduce((s, p) => s + (p.maximum_capacity ?? 0), 0);
    if (totalCapacity === 0) return "—";
    return `${Math.round((totalStock / totalCapacity) * 100)}%`;
  }, [positions]);

  // Nombre del producto en vez del código de SKU: el código solo (ORD-A102)
  // no dice nada de un vistazo, mientras que el nombre sí. El sku va como
  // cuarto elemento por si hace falta para key/tooltip.
  const topSkus = useMemo(
    () =>
      [...enrichedProducts]
        .filter((p) => p.dailyDemand > 0)
        .sort((a, b) => b.dailyDemand - a.dailyDemand)
        .slice(0, TOP_SKUS_COUNT)
        .map((p) => [p.name, p.dailyDemand, p.totalUnits, p.sku] as const),
    [enrichedProducts],
  );

  const inProcess = activeOrders.filter((o) => o.state === "en proceso").length;
  // Antes mostraba orders.length ("X totales") — pero `orders` viene de
  // useOrders() sin status, capado a 50 filas sin orden garantizado, así que
  // ese "total" nunca fue exacto (con cientos de órdenes reales, mostraba
  // como mucho 50). activeOrders.length sí es exacto (recorre todas las
  // páginas de pending/in_progress), así que el subtítulo pasa a contar
  // activas en vez de un "total" que nunca lo fue.
  const totalActiveOrders = activeOrders.length;

  // Mismo cálculo que "Cumplimiento" en Órdenes (completadas vs canceladas,
  // acotado por período, 100% cuando no hay datos) — antes esto se calculaba
  // sobre TODAS las órdenes sin fecha, así que nunca iba a coincidir.

  const inventarioValor = useMemo(() => {
    const total = products.reduce((sum, p) => sum + (p.available * p.priceCents) / 100, 0);
    if (total === 0) return "—";
    if (total >= 1_000_000) return `$${(total / 1_000_000).toFixed(1)}M`;
    if (total >= 1_000) return `$${(total / 1_000).toFixed(0)}K`;
    return `$${Math.round(total).toLocaleString("es-AR")}`;
  }, [products]);

  // dataKeys cortos que usan los gráficos; "h" es la etiqueta del eje X.
  const chartData = charts.points.map((p) => ({
    h: p.label,
    range: p.range,
    unidades: p.unidades,
    completadas: p.completadas,
    canceladas: p.canceladas,
  }));
  // En semana y mes el tooltip muestra el rango completo ("Semana del 06/10 al 12/10").
  const tooltipLabel = (label: unknown, payload: ReadonlyArray<{ payload?: { range?: string } }>) =>
    payload?.[0]?.payload?.range ?? String(label);

  return (
    <div className="space-y-6">
      {/* sticky: no modifica PageHeader (lo comparten Alertas/Configuración,
          que no piden esto) — el contenedor local es lo que se pega al hacer
          scroll dentro de <main>. */}
      <div className="sticky top-0 z-10 bg-background -mx-4 sm:-mx-6 px-4 sm:px-6 py-2">
        <PageHeader
          icon={LayoutDashboard}
          title="Home"
          description="Vista general del warehouse · Tiempo real"
          action={<PeriodPicker value={period} onChange={setPeriod} />}
        />
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label="Top SKU"
          value={topSkus[0]?.[0] ?? "—"}
          icon={Package}
          trend={
            topSkus[0]
              ? `${topSkus[0][2].toLocaleString("es-AR")} u. vendidas · ${periodLabel(period)}`
              : "Sin demanda en el período"
          }
          accent="primary"
          temporal={periodTemporal(periodLabel(period))}
          compact
        />
        <KpiCard
          label="Ocupación almacén"
          value={ocupacionAlmacen}
          icon={Warehouse}
          trend={`${products.length} SKUs activos`}
          accent="primary"
          temporal={live()}
        />
        <KpiCard
          label="Órdenes en proceso"
          value={String(inProcess)}
          icon={Activity}
          trend={`${totalActiveOrders} activas`}
          accent="accent"
          temporal={live()}
        />
        <KpiCard
          label="Valor del inventario"
          value={inventarioValor}
          icon={DollarSign}
          trend="stock disponible × precio"
          accent="primary"
          temporal={live()}
        />
        <KpiCard
          label="Cumplimiento"
          value={stats.compliancePct !== null ? `${stats.compliancePct}%` : "—"}
          icon={CheckCircle2}
          trend={
            stats.compliancePct !== null
              ? `completadas vs canceladas · ${periodLabel(period)}`
              : "Sin completadas ni canceladas en el período"
          }
          accent="primary"
          temporal={periodTemporal(periodLabel(period))}
        />
        <KpiCard
          label="T. Prom. Entre Fallas"
          value={formatDuration(fleet.fleetMtbf)}
          icon={HeartPulse}
          trend={fleet.fleetMtbf === null ? "Sin fallas en el período" : "Prom. entre fallas"}
          accent="destructive"
          temporal={periodTemporal(periodLabel(period))}
          source={fleet.metricsSource}
        />
      </section>

      {/* Rovers + Top SKUs */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel
          title="Estado de rovers"
          subtitle="Batería y operación"
          icon={Truck}
          className="xl:col-span-2"
          action={<TemporalBadge value={live()} />}
        >
          <div className="space-y-2">
            {pagedRovers.map((r) => {
              const bt = batteryTone(r.battery);
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border"
                >
                  <Truck className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">{r.name}</span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${stateStyles[r.state]}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" /> {r.state}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {r.zone} · {r.order ?? "sin orden"}
                    </p>
                  </div>
                  <div className="w-28">
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div className={`h-full ${bt.bar}`} style={{ width: `${r.battery}%` }} />
                    </div>
                    <p className={`text-[10px] mt-0.5 text-right ${bt.color}`}>
                      {Math.round(r.battery)}% · {bt.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <TablePagination
            page={roversPage}
            totalPages={roversTotalPages}
            onPageChange={setRoversPage}
            from={roversFrom}
            to={roversTo}
            total={roversTotal}
            itemLabel="rovers"
          />
        </Panel>

        <Panel
          title={`Top ${TOP_SKUS_COUNT} SKUs`}
          subtitle={`Mayor demanda diaria · ${periodLabel(period)}`}
          icon={Target}
          action={<TemporalBadge value={periodTemporal(periodLabel(period))} />}
          expandable
        >
          {(expanded) => (
            <div className="space-y-2">
              {topSkus.map(([name, demand, , sku]) => {
                const max = topSkus[0]?.[1] ?? 1;
                return (
                  <div key={sku} className="p-3 rounded-lg bg-secondary/30 border border-border">
                    <div className="flex justify-between items-center gap-2 mb-1.5">
                      <span
                        className={`font-bold flex-1 min-w-0 ${expanded ? "text-sm" : "text-xs truncate"}`}
                        title={name}
                      >
                        {name}
                      </span>
                      <span
                        className={`text-muted-foreground shrink-0 ${expanded ? "text-xs" : "text-[11px]"}`}
                      >
                        {/* 2 decimales, no 1: con 1 sólo, SKUs con demanda real
                          distinta redondeaban al mismo número en pantalla
                          mientras la barra (sin redondear) se veía distinta. */}
                        {demand < 1 ? demand.toFixed(2) : Math.round(demand)} u/d
                      </span>
                    </div>
                    <div
                      className={`rounded-full bg-secondary overflow-hidden ${expanded ? "h-2.5" : "h-1.5"}`}
                    >
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${(demand / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {topSkus.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-6">Sin datos</p>
              )}
            </div>
          )}
        </Panel>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel
          title="Unidades despachadas"
          subtitle={pickingSubtitle(charts.bucketKind)}
          icon={Clock}
          action={
            <div className="flex items-center gap-2">
              <TemporalBadge value={periodTemporal(periodLabel(period))} />
              <SourceBadge source={charts.source} />
            </div>
          }
          expandable
        >
          {(expanded) => (
            <ChartBox height={220}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.025 250)" />
                  <XAxis dataKey="h" stroke="oklch(0.7 0.02 240)" fontSize={expanded ? 13 : 11} />
                  <YAxis stroke="oklch(0.7 0.02 240)" fontSize={expanded ? 13 : 11} />
                  <Tooltip {...tooltip} labelFormatter={tooltipLabel} />
                  <Bar
                    dataKey="unidades"
                    name="Unidades"
                    fill="oklch(0.78 0.18 180)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
          )}
        </Panel>

        <Panel
          title={ordersByBucketTitle(charts.bucketKind)}
          subtitle="Completadas vs canceladas"
          icon={Activity}
          action={
            <div className="flex items-center gap-2">
              <TemporalBadge value={periodTemporal(periodLabel(period))} />
              <SourceBadge source={chartsSource} />
            </div>
          }
          expandable
        >
          {(expanded) => (
            <>
              <ChartBox height={220}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.025 250)" />
                    <XAxis dataKey="h" stroke="oklch(0.7 0.02 240)" fontSize={expanded ? 13 : 11} />
                    <YAxis stroke="oklch(0.7 0.02 240)" fontSize={expanded ? 13 : 11} />
                    <Tooltip {...tooltip} labelFormatter={tooltipLabel} />
                    <Bar
                      dataKey="completadas"
                      name="Completadas"
                      stackId="a"
                      fill="oklch(0.78 0.18 180)"
                    />
                    <Bar
                      dataKey="canceladas"
                      name="Canceladas"
                      stackId="a"
                      fill="oklch(0.65 0.24 27)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
              <div
                className={`flex gap-4 mt-2 text-muted-foreground justify-center ${expanded ? "text-xs" : "text-[10px]"}`}
              >
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-primary" />
                  Completadas (por fecha de completado)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-destructive" />
                  Canceladas (por fecha de creación)
                </span>
              </div>
            </>
          )}
        </Panel>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  accent,
  temporal,
  source = "live",
  // Para valores de texto largo (p.ej. un nombre de producto) en vez de un
  // número/porcentaje corto: letra más chica y hasta 2 líneas en vez de
  // cortar a los primeros caracteres con "…", que dejaba el valor ilegible.
  compact = false,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend: string;
  accent: "primary" | "accent" | "destructive";
  temporal: Temporality;
  source?: DataSource;
  compact?: boolean;
}) {
  const accentMap = {
    primary: "text-primary bg-primary/10",
    accent: "text-accent-foreground bg-accent",
    destructive: "text-destructive bg-destructive/10",
  };
  return (
    <div
      className="relative rounded-xl border border-border bg-card p-5 overflow-hidden hover:border-primary/30 transition"
      style={{ background: "var(--gradient-surface)" }}
    >
      <div className="flex justify-between items-start mb-3 gap-2">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${accentMap[accent]}`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex flex-col items-end gap-1">
          <TemporalBadge value={temporal} />
          <SourceBadge source={source} />
        </div>
      </div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p
        className={
          compact
            ? "text-base font-bold tracking-tight leading-snug line-clamp-2"
            : "text-2xl font-bold tracking-tight truncate"
        }
        title={value}
      >
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1">{trend}</p>
    </div>
  );
}
