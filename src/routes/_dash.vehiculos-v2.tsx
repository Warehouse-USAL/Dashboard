import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  Activity,
  Calendar as CalendarIcon,
  Filter,
  Truck,
  Zap,
  Clock,
  Wrench,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleWebSocket } from "@/hooks/useVehicleWebSocket";
import { usePagedList } from "@/hooks/usePagination";
import { TablePagination } from "@/components/dashboard/TablePagination";
import { SourceBadge } from "@/components/dashboard/SourceBadge";
import { useFleetMetrics, type FleetVehicleStats } from "@/hooks/useFleetMetrics";
import { formatDuration } from "@/lib/metrics-api";
import type { DataSource } from "@/lib/data-source";
import type { Rover, RoverState } from "@/lib/dashboard-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dash/vehiculos-v2")({
  component: RoversPage,
  head: () => ({ meta: [{ title: "Rovers · SmartWarehouse" }] }),
});

const PERIOD_OPTIONS = [
  { id: "24h", label: "Últimas 24 horas" },
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "90d", label: "Últimos 90 días" },
  { id: "custom", label: "Rango personalizado" },
] as const;
type PeriodId = (typeof PERIOD_OPTIONS)[number]["id"];

function periodLabel(value: PeriodId, range?: DateRange) {
  if (value === "custom") {
    if (range?.from && range?.to) {
      return `${format(range.from, "dd/MM/yy")} – ${format(range.to, "dd/MM/yy")}`;
    }
    if (range?.from) return `Desde ${format(range.from, "dd/MM/yy")}`;
    return "Rango personalizado";
  }
  return PERIOD_OPTIONS.find((p) => p.id === value)!.label;
}

const STATE_FILTERS: { id: RoverState; label: string }[] = [
  { id: "busy", label: "Busy" },
  { id: "idle", label: "Idle" },
  { id: "error", label: "Error" },
  { id: "offline", label: "Offline" },
];

/** Una por rover en los gráficos multi-serie. Se cicla si hay más rovers. */
const SERIES_COLORS = [
  "oklch(0.78 0.18 180)",
  "oklch(0.78 0.18 80)",
  "oklch(0.65 0.24 27)",
  "oklch(0.7 0.16 300)",
  "oklch(0.75 0.15 140)",
  "oklch(0.65 0.05 250)",
];

/** Los ejes de tiempo vienen en epoch de segundos, como los manda el backend. */
function formatTick(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Qué mostrar cuando un panel no tiene nada que graficar.
 *
 * Distingue "no hay datos" de "no pudimos traerlos": un almacén sin fallas y un
 * VictoriaMetrics caído se ven igual en un gráfico vacío, y no son lo mismo.
 */
function EmptyPanel({ source, empty }: { source: DataSource; empty: string }) {
  const message =
    source === "unavailable"
      ? "El almacén de métricas no está respondiendo."
      : source === "forbidden"
        ? "Tu rol no puede leer métricas de flota."
        : source === "mock"
          ? "El backend no respondió."
          : empty;
  return (
    <div className="h-[220px] flex items-center justify-center">
      <p className="text-[11px] text-muted-foreground">{message}</p>
    </div>
  );
}

function RoversPage() {
  const { data: rovers } = useVehicles();
  useVehicleWebSocket();

  const [period, setPeriod] = useState<PeriodId>("24h");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [stateFilter, setStateFilter] = useState<Set<RoverState>>(
    new Set(STATE_FILTERS.map((s) => s.id)),
  );

  const fleet = useFleetMetrics(period, customRange);

  const filteredRovers = useMemo(
    () => rovers.filter((r) => stateFilter.has(r.state)),
    [rovers, stateFilter],
  );

  const {
    page: roversPage,
    setPage: setRoversPage,
    totalPages: roversTotalPages,
    pageItems: pagedRovers,
    from: roversFrom,
    to: roversTo,
    total: roversFilteredTotal,
  } = usePagedList(filteredRovers, 10);

  const totalRovers = rovers.length;
  const activos = rovers.filter((r) => r.state === "busy").length;
  const cargando = rovers.filter((r) => r.state === "idle").length;
  const detenidos = rovers.filter((r) => r.state === "error").length;
  const disponibilidad = totalRovers ? Math.round((activos / totalRovers) * 100) : 0;
  const utilizacion = totalRovers
    ? Math.round((rovers.filter((r) => r.order).length / totalRovers) * 100)
    : 0;
  const horasTotales = rovers.reduce((a, r) => a + r.hours, 0);

  const kpis = [
    {
      icon: Truck,
      label: "Rovers activos",
      value: `${activos}`,
      suffix: ` / ${totalRovers}`,
      sub: `${Math.round((activos / Math.max(totalRovers, 1)) * 100)}% del total`,
      tone: "primary" as const,
    },
    {
      icon: Activity,
      label: "Disponibilidad",
      value: `${disponibilidad}%`,
      sub: `${cargando} idle · ${detenidos} error`,
      tone: "success" as const,
    },
    {
      icon: Zap,
      label: "Utilización de flota",
      value: `${utilizacion}%`,
      sub: "Rovers con orden asignada",
      tone: "warning" as const,
    },
    {
      icon: Clock,
      label: "MTBF",
      value: formatDuration(fleet.fleetMtbf),
      sub: fleet.fleetMtbf === null ? "Sin fallas en el período" : "Prom. entre fallas",
      tone: "info" as const,
      source: fleet.metricsSource,
    },
    {
      icon: Wrench,
      label: "MTTR",
      value: formatDuration(fleet.fleetMttr),
      sub: fleet.fleetMttr === null ? "Sin fallas en el período" : "Prom. reparación",
      tone: "warning" as const,
      source: fleet.metricsSource,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-end gap-2 flex-wrap text-xs">
        <PeriodPicker
          value={period}
          onChange={setPeriod}
          range={customRange}
          onRangeChange={setCustomRange}
        />
        <FilterMenu selected={stateFilter} onChange={setStateFilter} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      {/* Estado de rovers */}
      <Panel
        title="Estado de rovers"
        action={
          <span className="text-[11px] text-muted-foreground">
            {filteredRovers.length} de {totalRovers}
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <Th>Rover</Th>
                <Th>Estado</Th>
                <Th>Batería</Th>
                <Th>Ubicación</Th>
                <Th>Orden actual</Th>
                <Th className="text-right">Horas operación</Th>
              </tr>
            </thead>
            <tbody>
              {pagedRovers.map((r) => (
                <RoverRow key={r.id} r={r} />
              ))}
              {filteredRovers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                    Sin rovers para los filtros seleccionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={roversPage}
          totalPages={roversTotalPages}
          onPageChange={setRoversPage}
          from={roversFrom}
          to={roversTo}
          total={roversFilteredTotal}
          itemLabel="rovers"
        />
        <div className="flex flex-wrap gap-4 mt-4 text-[11px] text-muted-foreground">
          <LegendDot color="bg-primary" label="busy" />
          <LegendDot color="bg-warning" label="idle" />
          <LegendDot color="bg-destructive" label="error" />
          <LegendDot color="bg-muted-foreground" label="offline" />
        </div>
      </Panel>

      {/* Productividad por rover */}
      <ProductividadPorRover
        rovers={rovers}
        stats={fleet.perVehicle}
        source={fleet.ordersSource}
        period={period}
        range={customRange}
      />

      {/* Histórico + Pareto + Actividad */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/*
          Era una tabla de eventos con descripción, duración y severidad. El
          backend publica un contador de transiciones hacia ERROR, no un log de
          incidentes: esas tres columnas no existen del otro lado y no hay forma
          honesta de llenarlas. La receta 1 devuelve fallas por rover por
          intervalo y dice "grafíquenlo tal cual".
        */}
        <Panel
          title="Histórico de fallas por rover"
          className="lg:col-span-2 xl:col-span-1"
          action={
            <div className="flex items-center gap-2">
              <SourceBadge source={fleet.metricsSource} />
              <PeriodLabelView value={period} range={customRange} />
            </div>
          }
        >
          {fleet.failureHistory.length === 0 ? (
            <EmptyPanel source={fleet.metricsSource} empty="Sin fallas registradas en el período" />
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fleet.failureHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="t"
                    tickFormatter={formatTick}
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    labelFormatter={formatTick}
                    contentStyle={{
                      fontSize: 11,
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {fleet.vehicleIds.map((id, i) => (
                    <Line
                      key={id}
                      type="monotone"
                      dataKey={id}
                      stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      name={id}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Fallos por categoría (Pareto)"
          action={
            <div className="flex items-center gap-2">
              <SourceBadge source={fleet.metricsSource} />
              <PeriodLabelView value={period} range={customRange} />
            </div>
          }
        >
          {fleet.paretoBars.length === 0 ? (
            <EmptyPanel source={fleet.metricsSource} empty="Sin fallas registradas en el período" />
          ) : (
            <div className="space-y-3 mt-2">
              {fleet.paretoBars.map((p) => (
                <div key={p.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{p.label}</span>
                    <span className="text-muted-foreground">
                      {p.failures.toFixed(0)} · {p.pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-destructive" style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {/*
            UNCATEGORIZED no es una categoría de falla: es lo que queda cuando la
            caída no pasó por un `vehicle.error` con código — típicamente un rover
            que se autoreporta caído en su telemetría de rutina. Vale aclararlo
            sólo si esa barra aparece.
          */}
          {fleet.paretoBars.some((b) => b.label === "UNCATEGORIZED") && (
            <p className="text-[10px] text-muted-foreground mt-3">
              «UNCATEGORIZED» son caídas sin código de error reportado, no una categoría de falla.
            </p>
          )}
        </Panel>

        <Panel
          title="Actividad de la flota"
          action={
            <div className="flex items-center gap-2">
              <SourceBadge source={fleet.source} />
              <PeriodLabelView value={period} range={customRange} />
            </div>
          }
        >
          {fleet.activity.length === 0 ? (
            <EmptyPanel source={fleet.source} empty="Sin actividad en el período" />
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fleet.activity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="t"
                    tickFormatter={formatTick}
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    labelFormatter={formatTick}
                    contentStyle={{
                      fontSize: 11,
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="orders"
                    stroke="oklch(0.78 0.18 80)"
                    strokeWidth={2}
                    dot={false}
                    name="Órdenes creadas"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="rovers"
                    stroke="oklch(0.65 0.05 250)"
                    strokeWidth={2}
                    dot={false}
                    name="Rovers activos"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {/*
            "Rovers activos" sale de contar el gauge de estado, que con step
            grande devuelve el PROMEDIO de rovers BUSY durante el bloque, no un
            conteo instantáneo. Por eso puede dar decimales: es correcto.
          */}
          <p className="text-[10px] text-muted-foreground mt-3">
            «Rovers activos» es el promedio de rovers ocupados en cada intervalo, por eso puede
            tener decimales.
          </p>
        </Panel>
      </div>

      <p className="text-[10px] text-muted-foreground text-right">
        Datos de rovers en tiempo real · {horasTotales.toFixed(1)} horas acumuladas hoy
      </p>
    </div>
  );
}

// --- subcomponents ---

function RoverRow({ r }: { r: Rover }) {
  return (
    <tr className="border-b border-border/50 hover:bg-secondary/30">
      <td className="py-3 px-2 text-xs font-bold">
        <span className="flex items-center gap-2">
          <Truck className="w-3.5 h-3.5 text-muted-foreground" />
          {r.name}
        </span>
      </td>
      <td className="py-3 px-2">
        <StateBadge state={r.state} />
      </td>
      <td className="py-3 px-2">
        <div className="flex items-center gap-2">
          <span className="text-xs w-8">{Math.round(r.battery)}%</span>
          <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full ${r.battery < 25 ? "bg-destructive" : r.battery < 60 ? "bg-warning" : "bg-primary"}`}
              style={{ width: `${r.battery}%` }}
            />
          </div>
        </div>
      </td>
      <td className="py-3 px-2 text-xs font-mono">
        X:{Math.round(r.x)} Y:{Math.round(r.y)}
      </td>
      <td className="py-3 px-2 text-xs">{r.order ?? "—"}</td>
      <td className="py-3 px-2 text-xs text-right text-muted-foreground">
        {r.hours > 0 ? `${r.hours.toFixed(1)} h` : "—"}
      </td>
    </tr>
  );
}

function Panel({
  title,
  action,
  className = "",
  children,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-sm font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium py-2 px-2 ${className}`}>{children}</th>;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  suffix,
  sub,
  tone,
  source = "live",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  suffix?: string;
  sub: string;
  tone: string;
  source?: DataSource;
}) {
  const toneCls: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    success: "text-primary bg-primary/10",
    warning: "text-warning bg-warning/10",
    info: "text-info bg-info/10",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div
          className={`w-8 h-8 rounded-md flex items-center justify-center ${toneCls[tone] ?? "text-primary bg-primary/10"}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <SourceBadge source={source} />
      </div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-0.5">
        {value}
        <span className="text-sm text-muted-foreground font-normal">{suffix}</span>
      </p>
      <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, string> = {
    busy: "bg-primary/15 text-primary border-primary/30",
    idle: "bg-warning/15 text-warning border-warning/30",
    error: "bg-destructive/15 text-destructive border-destructive/30",
    offline: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${map[state] ?? map.inactivo}`}>
      {state}
    </span>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function PeriodLabelView({ value, range }: { value: PeriodId; range?: DateRange }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <CalendarIcon className="w-3 h-3" />
      {periodLabel(value, range)}
    </span>
  );
}

function PeriodPicker({
  value,
  onChange,
  range,
  onRangeChange,
}: {
  value: PeriodId;
  onChange: (v: PeriodId) => void;
  range?: DateRange;
  onRangeChange?: (r: DateRange | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border border-border bg-card hover:bg-secondary/40 px-3 py-1.5 text-xs">
          <CalendarIcon className="w-3.5 h-3.5" /> {periodLabel(value, range)}{" "}
          <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2">
        <div className="flex">
          <div className="w-48 p-1 border-r border-border">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onChange(p.id);
                  if (p.id !== "custom") setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-secondary/60",
                  p.id === value && "bg-secondary/60",
                )}
              >
                {p.label}
                {p.id === value && <Check className="w-3 h-3 text-primary" />}
              </button>
            ))}
          </div>
          {value === "custom" && (
            <div className="p-1">
              <Calendar
                mode="range"
                selected={range}
                onSelect={onRangeChange}
                numberOfMonths={2}
                locale={es}
                className="p-2 pointer-events-auto"
              />
              <div className="flex justify-end px-2 pb-1">
                <button
                  onClick={() => setOpen(false)}
                  disabled={!range?.from || !range?.to}
                  className="text-[11px] text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                >
                  Aplicar ›
                </button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterMenu({
  selected,
  onChange,
}: {
  selected: Set<RoverState>;
  onChange: (s: Set<RoverState>) => void;
}) {
  const toggle = (id: RoverState) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const allOn = selected.size === STATE_FILTERS.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-secondary/40 text-xs">
          <Filter className="w-3.5 h-3.5" /> Filtros
          {!allOn && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px]">
              {selected.size}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">
          Estado
        </p>
        {STATE_FILTERS.map((s) => {
          const on = selected.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-secondary/60"
            >
              <span className="flex items-center gap-2">
                <span
                  className={`w-3.5 h-3.5 rounded border ${on ? "bg-primary border-primary" : "border-border"} flex items-center justify-center`}
                >
                  {on && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </span>
                {s.label}
              </span>
            </button>
          );
        })}
        <div className="flex justify-between mt-2 pt-2 border-t border-border">
          <button
            onClick={() => onChange(new Set())}
            className="text-[11px] text-muted-foreground hover:text-foreground px-1"
          >
            Limpiar
          </button>
          <button
            onClick={() => onChange(new Set(STATE_FILTERS.map((s) => s.id)))}
            className="text-[11px] text-primary hover:underline px-1"
          >
            Todos
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ProductividadPorRover({
  rovers,
  stats,
  source,
  period,
  range,
}: {
  rovers: Rover[];
  stats: FleetVehicleStats[];
  source: DataSource;
  period: PeriodId;
  range?: DateRange;
}) {
  // Antes esto traía TODAS las órdenes completadas (con el tope de 50 filas de
  // getOrders) y las contaba en JS. Ahora el conteo lo hace Mongo sobre la
  // ventana entera, en useFleetMetrics.
  const rows = useMemo(() => {
    const byId = new Map(stats.map((s) => [s.vehicleId, s]));
    return rovers.map((r) => {
      const s = byId.get(r.id);
      return {
        id: r.id,
        name: r.name,
        ordenes: s?.orders ?? 0,
        asignadas: s?.ordersAssigned ?? 0,
        // La eficiencia venía de una fórmula inventada sobre el estado y la
        // batería del rover, mientras la nota al pie afirmaba que era
        // "completadas sobre asignadas". Ahora es eso de verdad.
        eficiencia: s?.efficiency ?? null,
      };
    });
  }, [rovers, stats]);

  const {
    page: prodPage,
    setPage: setProdPage,
    totalPages: prodTotalPages,
    pageItems: pagedRows,
    from: prodFrom,
    to: prodTo,
    total: prodTotal,
  } = usePagedList(rows, 10);

  const maxOrdenes = Math.max(1, ...rows.map((r) => r.ordenes));
  const efColor = (e: number) =>
    e >= 85 ? "bg-primary" : e >= 65 ? "bg-warning" : "bg-destructive";

  return (
    <Panel
      title="Productividad por rover"
      action={
        <div className="flex items-center gap-2">
          <SourceBadge source={source} />
          <PeriodLabelView value={period} range={range} />
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <Th>Rover</Th>
              <Th>Órdenes completadas</Th>
              <Th className="text-right pr-4">Eficiencia</Th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((r) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30">
                <td className="py-3 px-2 text-xs font-bold">
                  <span className="flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                    {r.name}
                  </span>
                </td>
                <td className="py-3 px-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs w-10 tabular-nums">{r.ordenes}</span>
                    <div className="flex-1 max-w-[220px] h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary/70"
                        style={{ width: `${(r.ordenes / maxOrdenes) * 100}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="py-3 px-2">
                  {r.eficiencia === null ? (
                    <p className="text-xs text-right text-muted-foreground pr-4">
                      sin asignaciones
                    </p>
                  ) : (
                    <div className="flex items-center justify-end gap-3">
                      <div className="w-28 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full ${efColor(r.eficiencia)}`}
                          style={{ width: `${r.eficiencia}%` }}
                        />
                      </div>
                      <span className="text-xs w-10 text-right tabular-nums font-medium">
                        {Math.round(r.eficiencia)}%
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination
        page={prodPage}
        totalPages={prodTotalPages}
        onPageChange={setProdPage}
        from={prodFrom}
        to={prodTo}
        total={prodTotal}
        itemLabel="rovers"
      />
      <p className="text-[10px] text-muted-foreground mt-3">
        Eficiencia = órdenes completadas sobre asignadas en el período, contadas por el backend
        sobre la ventana entera.
      </p>
    </Panel>
  );
}
