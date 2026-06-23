import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  Activity,
  Calendar as CalendarIcon,
  Filter,
  Download,
  Truck,
  Zap,
  Clock,
  Wrench,
  TrendingUp,
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
type DataPeriodId = Exclude<PeriodId, "custom">;

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
  { id: "activo", label: "Activo" },
  { id: "cargando", label: "Cargando" },
  { id: "detenido", label: "Detenido" },
  { id: "inactivo", label: "Inactivo" },
];

// Datos sintéticos de histórico y pareto por periodo
const HISTORIAL_BY_PERIOD: Record<
  DataPeriodId,
  Array<{
    date: string;
    rover: string;
    tipo: string;
    cat: string;
    desc: string;
    dur: string;
    sev: string;
  }>
> = {
  "24h": [
    {
      date: "Hoy 10:41",
      rover: "R-02",
      tipo: "Falla",
      cat: "Navegación",
      desc: "Obstáculo detectado en ruta",
      dur: "4 min",
      sev: "Alta",
    },
    {
      date: "Hoy 09:33",
      rover: "R-03",
      tipo: "Alerta",
      cat: "Batería",
      desc: "Batería baja (18%)",
      dur: "—",
      sev: "Media",
    },
    {
      date: "Hoy 08:22",
      rover: "R-01",
      tipo: "Aviso",
      cat: "Orden",
      desc: "Retraso por congestión",
      dur: "—",
      sev: "Baja",
    },
  ],
  "7d": [
    {
      date: "25/05 20:41",
      rover: "R-02",
      tipo: "Falla",
      cat: "Navegación",
      desc: "Obstáculo detectado en ruta",
      dur: "4 min",
      sev: "Alta",
    },
    {
      date: "25/05 19:33",
      rover: "R-03",
      tipo: "Alerta",
      cat: "Batería",
      desc: "Batería baja (18%)",
      dur: "—",
      sev: "Media",
    },
    {
      date: "24/05 17:05",
      rover: "R-02",
      tipo: "Falla",
      cat: "Motor",
      desc: "Sobretemperatura motor",
      dur: "12 min",
      sev: "Alta",
    },
    {
      date: "23/05 16:48",
      rover: "R-01",
      tipo: "Mantenimiento",
      cat: "Preventivo",
      desc: "Mantenimiento programado",
      dur: "1 h 20 min",
      sev: "Media",
    },
    {
      date: "22/05 11:10",
      rover: "R-03",
      tipo: "Aviso",
      cat: "Orden",
      desc: "Retraso por congestión",
      dur: "—",
      sev: "Baja",
    },
  ],
  "30d": [
    {
      date: "25/05 20:41",
      rover: "R-02",
      tipo: "Falla",
      cat: "Navegación",
      desc: "Obstáculo detectado en ruta",
      dur: "4 min",
      sev: "Alta",
    },
    {
      date: "21/05 14:08",
      rover: "R-01",
      tipo: "Falla",
      cat: "Sensores",
      desc: "Lectura inconsistente LIDAR",
      dur: "9 min",
      sev: "Media",
    },
    {
      date: "18/05 09:30",
      rover: "R-03",
      tipo: "Alerta",
      cat: "Batería",
      desc: "Ciclo de carga prolongado",
      dur: "—",
      sev: "Baja",
    },
    {
      date: "15/05 17:05",
      rover: "R-02",
      tipo: "Falla",
      cat: "Motor",
      desc: "Sobretemperatura motor",
      dur: "12 min",
      sev: "Alta",
    },
    {
      date: "10/05 12:22",
      rover: "R-01",
      tipo: "Mantenimiento",
      cat: "Preventivo",
      desc: "Cambio de ruedas",
      dur: "45 min",
      sev: "Media",
    },
    {
      date: "03/05 08:14",
      rover: "R-03",
      tipo: "Falla",
      cat: "Comunicación",
      desc: "Pérdida de señal WiFi",
      dur: "6 min",
      sev: "Media",
    },
  ],
  "90d": [
    {
      date: "25/05 20:41",
      rover: "R-02",
      tipo: "Falla",
      cat: "Navegación",
      desc: "Obstáculo detectado en ruta",
      dur: "4 min",
      sev: "Alta",
    },
    {
      date: "11/04 13:10",
      rover: "R-01",
      tipo: "Falla",
      cat: "Software",
      desc: "Reinicio inesperado",
      dur: "3 min",
      sev: "Baja",
    },
    {
      date: "29/03 16:00",
      rover: "R-03",
      tipo: "Falla",
      cat: "Motor",
      desc: "Vibración anormal",
      dur: "22 min",
      sev: "Alta",
    },
    {
      date: "12/03 09:45",
      rover: "R-02",
      tipo: "Mantenimiento",
      cat: "Correctivo",
      desc: "Reemplazo sensor frontal",
      dur: "2 h",
      sev: "Media",
    },
    {
      date: "01/03 11:30",
      rover: "R-01",
      tipo: "Alerta",
      cat: "Batería",
      desc: "Degradación de celda",
      dur: "—",
      sev: "Media",
    },
  ],
};

const PARETO_BY_PERIOD: Record<
  DataPeriodId,
  Array<{ label: string; pct: number; color: string }>
> = {
  "24h": [
    { label: "Navegación", pct: 50, color: "bg-destructive" },
    { label: "Batería", pct: 30, color: "bg-warning" },
    { label: "Orden", pct: 20, color: "bg-warning/70" },
  ],
  "7d": [
    { label: "Navegación", pct: 42, color: "bg-destructive" },
    { label: "Batería", pct: 28, color: "bg-warning" },
    { label: "Motor", pct: 15, color: "bg-warning/70" },
    { label: "Orden", pct: 8, color: "bg-primary/60" },
    { label: "Comunicación", pct: 5, color: "bg-primary/50" },
    { label: "Software", pct: 2, color: "bg-primary/40" },
  ],
  "30d": [
    { label: "Navegación", pct: 38, color: "bg-destructive" },
    { label: "Batería", pct: 25, color: "bg-warning" },
    { label: "Motor", pct: 18, color: "bg-warning/70" },
    { label: "Sensores", pct: 10, color: "bg-primary/60" },
    { label: "Comunicación", pct: 6, color: "bg-primary/50" },
    { label: "Software", pct: 3, color: "bg-primary/40" },
  ],
  "90d": [
    { label: "Navegación", pct: 35, color: "bg-destructive" },
    { label: "Motor", pct: 22, color: "bg-warning" },
    { label: "Batería", pct: 20, color: "bg-warning/70" },
    { label: "Sensores", pct: 11, color: "bg-primary/60" },
    { label: "Comunicación", pct: 7, color: "bg-primary/50" },
    { label: "Software", pct: 5, color: "bg-primary/40" },
  ],
};

const ACTIVIDAD_BY_PERIOD: Record<
  DataPeriodId,
  Array<{ h: string; ordenes: number; rovers: number }>
> = {
  "24h": Array.from({ length: 13 }, (_, i) => {
    const h = i * 2;
    return {
      h: `${String(h).padStart(2, "0")}:00`,
      ordenes: [4, 3, 5, 12, 22, 28, 31, 28, 24, 26, 19, 12, 6][i],
      rovers: [1, 1, 2, 2, 3, 3, 3, 3, 3, 3, 2, 2, 1][i],
    };
  }),
  "7d": ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d, i) => ({
    h: d,
    ordenes: [180, 210, 195, 240, 260, 140, 90][i],
    rovers: [3, 3, 3, 3, 3, 2, 2][i],
  })),
  "30d": Array.from({ length: 6 }, (_, i) => ({
    h: `Sem ${i + 1}`,
    ordenes: [1100, 1240, 1180, 1320, 1410, 1260][i],
    rovers: [3, 3, 3, 3, 3, 3][i],
  })),
  "90d": ["Mar", "Abr", "May"].map((m, i) => ({
    h: m,
    ordenes: [4800, 5120, 5340][i],
    rovers: [3, 3, 3][i],
  })),
};

function RoversPage() {
  const { data: rovers } = useVehicles();
  useVehicleWebSocket();

  const [period, setPeriod] = useState<PeriodId>("24h");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [stateFilter, setStateFilter] = useState<Set<RoverState>>(
    new Set(STATE_FILTERS.map((s) => s.id)),
  );

  // Mapea período "custom" a un dataset existente según el ancho del rango.
  const dataPeriod: DataPeriodId = useMemo(() => {
    if (period !== "custom") return period;
    if (!customRange?.from || !customRange?.to) return "30d";
    const days = Math.ceil((customRange.to.getTime() - customRange.from.getTime()) / 86_400_000);
    if (days <= 1) return "24h";
    if (days <= 7) return "7d";
    if (days <= 30) return "30d";
    return "90d";
  }, [period, customRange]);

  const filteredRovers = useMemo(
    () => rovers.filter((r) => stateFilter.has(r.state)),
    [rovers, stateFilter],
  );

  const totalRovers = rovers.length;
  const activos = rovers.filter((r) => r.state === "activo").length;
  const cargando = rovers.filter((r) => r.state === "cargando").length;
  const detenidos = rovers.filter((r) => r.state === "detenido").length;
  const disponibilidad = totalRovers ? Math.round((activos / totalRovers) * 100) : 0;
  const utilizacion = totalRovers
    ? Math.round((rovers.filter((r) => r.order).length / totalRovers) * 100)
    : 0;
  const horasTotales = rovers.reduce((a, r) => a + r.hours, 0);
  const ordenesCompletadas = ACTIVIDAD_BY_PERIOD[dataPeriod].reduce((a, x) => a + x.ordenes, 0);

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
      sub: `${cargando} cargando · ${detenidos} detenidos`,
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
      value: "48.6 h",
      sub: "Prom. entre fallas",
      tone: "info" as const,
    },
    {
      icon: Wrench,
      label: "MTTR",
      value: "18.7 min",
      sub: "Prom. reparación",
      tone: "warning" as const,
    },
    {
      icon: TrendingUp,
      label: "Productividad",
      value: ordenesCompletadas.toLocaleString("es-AR"),
      sub: "Órdenes completadas",
      tone: "primary" as const,
    },
  ];

  const historial = HISTORIAL_BY_PERIOD[dataPeriod];
  const pareto = PARETO_BY_PERIOD[dataPeriod];
  const actividad = ACTIVIDAD_BY_PERIOD[dataPeriod];

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
              {filteredRovers.map((r) => (
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
        <div className="flex flex-wrap gap-4 mt-4 text-[11px] text-muted-foreground">
          <LegendDot color="bg-primary" label="activo" />
          <LegendDot color="bg-warning" label="cargando" />
          <LegendDot color="bg-destructive" label="detenido" />
          <LegendDot color="bg-muted-foreground" label="inactivo" />
        </div>
      </Panel>

      {/* Productividad por rover */}
      <ProductividadPorRover
        rovers={rovers}
        totalOrdenes={ordenesCompletadas}
        period={period}
        range={customRange}
      />

      {/* Histórico + Pareto + Actividad */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel
          title="Histórico de fallas / eventos"
          className="lg:col-span-2 xl:col-span-1"
          action={<PeriodLabelView value={period} range={customRange} />}
        >
          <div className="flex justify-end mb-2">
            <button className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-border bg-secondary/40 hover:bg-secondary/60">
              <Download className="w-3 h-3" />
              Exportar
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <Th>Fecha / hora</Th>
                  <Th>Rover</Th>
                  <Th>Tipo</Th>
                  <Th>Categoría</Th>
                  <Th>Descripción</Th>
                  <Th>Duración</Th>
                  <Th>Severidad</Th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-secondary/30">
                    <td className="py-2.5 px-2 text-xs">{h.date}</td>
                    <td className="py-2.5 px-2 text-xs font-medium">{h.rover}</td>
                    <td className="py-2.5 px-2 text-xs">{h.tipo}</td>
                    <td className="py-2.5 px-2 text-xs">{h.cat}</td>
                    <td className="py-2.5 px-2 text-xs">{h.desc}</td>
                    <td className="py-2.5 px-2 text-xs">{h.dur}</td>
                    <td className="py-2.5 px-2 text-xs">
                      <SeverityBadge sev={h.sev} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="Fallos por categoría (Pareto)"
          action={<PeriodLabelView value={period} range={customRange} />}
        >
          <div className="space-y-3 mt-2">
            {pareto.map((p) => (
              <div key={p.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{p.label}</span>
                  <span className="text-muted-foreground">{p.pct}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${p.color}`}
                    style={{ width: `${Math.min(p.pct * 2, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Actividad de la flota"
          action={<PeriodLabelView value={period} range={customRange} />}
        >
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={actividad}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="h" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
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
                  dataKey="ordenes"
                  stroke="oklch(0.78 0.18 80)"
                  strokeWidth={2}
                  dot={false}
                  name="Órdenes completadas"
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
          {r.id}
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
      <td className="py-3 px-2 text-xs">{r.zone}</td>
      <td className="py-3 px-2 text-xs">{r.order ?? "—"}</td>
      <td className="py-3 px-2 text-xs text-right text-muted-foreground">{r.hours.toFixed(1)} h</td>
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
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  suffix?: string;
  sub: string;
  tone: string;
}) {
  const toneCls: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    success: "text-primary bg-primary/10",
    warning: "text-warning bg-warning/10",
    info: "text-info bg-info/10",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div
        className={`w-8 h-8 rounded-md flex items-center justify-center mb-2 ${toneCls[tone] ?? "text-primary bg-primary/10"}`}
      >
        <Icon className="w-4 h-4" />
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
    activo: "bg-primary/15 text-primary border-primary/30",
    cargando: "bg-warning/15 text-warning border-warning/30",
    detenido: "bg-destructive/15 text-destructive border-destructive/30",
    inactivo: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${map[state] ?? map.inactivo}`}>
      {state}
    </span>
  );
}

function SeverityBadge({ sev }: { sev: string }) {
  const map: Record<string, string> = {
    Alta: "text-destructive",
    Media: "text-warning",
    Baja: "text-primary",
  };
  return <span className={`font-medium ${map[sev] ?? ""}`}>{sev}</span>;
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

// Productividad por rover (órdenes completadas + eficiencia para cumplir la orden)
function ProductividadPorRover({
  rovers,
  totalOrdenes,
  period,
  range,
}: {
  rovers: Rover[];
  totalOrdenes: number;
  period: PeriodId;
  range?: DateRange;
}) {
  // Reparto determinístico de órdenes por rover según estado y batería.
  const weights = rovers.map((r) => {
    const base =
      r.state === "activo"
        ? 1
        : r.state === "cargando"
          ? 0.45
          : r.state === "detenido"
            ? 0.15
            : 0.25;
    return base * (0.6 + r.battery / 250); // 0.6–1.0 aprox
  });
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;

  const rows = rovers.map((r, i) => {
    const ordenes = Math.round((weights[i] / totalW) * totalOrdenes);
    // Eficiencia: % de órdenes cumplidas exitosamente (sintética según estado y batería)
    const efBase =
      r.state === "activo" ? 90 : r.state === "cargando" ? 70 : r.state === "detenido" ? 45 : 60;
    const eficiencia = Math.max(30, Math.min(99, Math.round(efBase + (r.battery - 50) / 5)));
    return { id: r.id, ordenes, eficiencia };
  });

  const maxOrdenes = Math.max(1, ...rows.map((r) => r.ordenes));

  const efColor = (e: number) =>
    e >= 85 ? "bg-primary" : e >= 65 ? "bg-warning" : "bg-destructive";

  return (
    <Panel
      title="Productividad por rover"
      action={<PeriodLabelView value={period} range={range} />}
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
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30">
                <td className="py-3 px-2 text-xs font-bold">
                  <span className="flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                    {r.id}
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
                  <div className="flex items-center justify-end gap-3">
                    <div className="w-28 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${efColor(r.eficiencia)}`}
                        style={{ width: `${r.eficiencia}%` }}
                      />
                    </div>
                    <span className="text-xs w-10 text-right tabular-nums font-medium">
                      {r.eficiencia}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground mt-3">
        Eficiencia = % de órdenes cumplidas exitosamente sobre asignadas en el período.
      </p>
    </Panel>
  );
}
