import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  Calendar as CalendarIcon,
  Filter,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  Gauge,
  Timer,
  ShieldCheck,
  ListChecks,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { useOrders } from "@/hooks/useOrders";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dash/ordenes-v2")({
  component: OrdenesPage,
  head: () => ({ meta: [{ title: "Órdenes · SmartWarehouse" }] }),
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

type Priority = "alta" | "media" | "baja";
type OrderState = "pending" | "in_progress" | "completed" | "cancelled";

const STATE_LABELS: Record<OrderState, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

// map legacy mock states from useOrders -> new state vocabulary
const LEGACY_STATE_MAP: Record<string, OrderState> = {
  "en proceso": "in_progress",
  "en espera": "pending",
  completada: "completed",
  cancelada: "cancelled",
};

const PRIORITY_FILTERS: { id: Priority; label: string }[] = [
  { id: "alta", label: "Alta" },
  { id: "media", label: "Media" },
  { id: "baja", label: "Baja" },
];
const STATE_FILTERS: { id: OrderState; label: string }[] = (
  Object.keys(STATE_LABELS) as OrderState[]
).map((id) => ({ id, label: STATE_LABELS[id] }));

function periodLabel(value: PeriodId, range?: DateRange) {
  if (value === "custom") {
    if (range?.from && range?.to)
      return `${format(range.from, "dd/MM/yy")} – ${format(range.to, "dd/MM/yy")}`;
    if (range?.from) return `Desde ${format(range.from, "dd/MM/yy")}`;
    return "Rango personalizado";
  }
  return PERIOD_OPTIONS.find((p) => p.id === value)!.label;
}

// --- datasets sintéticos por período ---

const KPIS_BY_PERIOD: Record<
  DataPeriodId,
  {
    ordHora: number;
    ordHoraDelta: number;
    cycle: number;
    cycleDelta: number;
    sla: number;
    slaDelta: number;
    total: number;
  }
> = {
  "24h": {
    ordHora: 124,
    ordHoraDelta: 8,
    cycle: 18.6,
    cycleDelta: -2.1,
    sla: 96.4,
    slaDelta: 1.3,
    total: 2976,
  },
  "7d": {
    ordHora: 118,
    ordHoraDelta: 4,
    cycle: 19.4,
    cycleDelta: -1.2,
    sla: 95.8,
    slaDelta: 0.6,
    total: 19824,
  },
  "30d": {
    ordHora: 121,
    ordHoraDelta: 2,
    cycle: 19.0,
    cycleDelta: -0.8,
    sla: 96.0,
    slaDelta: 0.9,
    total: 87120,
  },
  "90d": {
    ordHora: 119,
    ordHoraDelta: -1,
    cycle: 19.7,
    cycleDelta: 0.3,
    sla: 95.2,
    slaDelta: -0.2,
    total: 257040,
  },
};

const DISTRIBUCION_BY_PERIOD: Record<DataPeriodId, Record<OrderState, number>> = {
  "24h": { pending: 93, in_progress: 32, completed: 12, cancelled: 5 },
  "7d": { pending: 480, in_progress: 210, completed: 1840, cancelled: 62 },
  "30d": { pending: 1240, in_progress: 640, completed: 8120, cancelled: 244 },
  "90d": { pending: 3210, in_progress: 1840, completed: 23890, cancelled: 712 },
};

const AGING_BY_PERIOD: Record<
  DataPeriodId,
  Array<{ bucket: string; value: number; tone: string }>
> = {
  "24h": [
    { bucket: "< 5 min", value: 42, tone: "bg-emerald-500" },
    { bucket: "5 - 15 min", value: 28, tone: "bg-emerald-500" },
    { bucket: "15 - 30 min", value: 15, tone: "bg-amber-400" },
    { bucket: "30 - 60 min", value: 6, tone: "bg-amber-500" },
    { bucket: "> 60 min", value: 2, tone: "bg-rose-500" },
  ],
  "7d": [
    { bucket: "< 5 min", value: 184, tone: "bg-emerald-500" },
    { bucket: "5 - 15 min", value: 142, tone: "bg-emerald-500" },
    { bucket: "15 - 30 min", value: 78, tone: "bg-amber-400" },
    { bucket: "30 - 60 min", value: 34, tone: "bg-amber-500" },
    { bucket: "> 60 min", value: 12, tone: "bg-rose-500" },
  ],
  "30d": [
    { bucket: "< 5 min", value: 612, tone: "bg-emerald-500" },
    { bucket: "5 - 15 min", value: 488, tone: "bg-emerald-500" },
    { bucket: "15 - 30 min", value: 246, tone: "bg-amber-400" },
    { bucket: "30 - 60 min", value: 110, tone: "bg-amber-500" },
    { bucket: "> 60 min", value: 38, tone: "bg-rose-500" },
  ],
  "90d": [
    { bucket: "< 5 min", value: 1840, tone: "bg-emerald-500" },
    { bucket: "5 - 15 min", value: 1420, tone: "bg-emerald-500" },
    { bucket: "15 - 30 min", value: 720, tone: "bg-amber-400" },
    { bucket: "30 - 60 min", value: 340, tone: "bg-amber-500" },
    { bucket: "> 60 min", value: 124, tone: "bg-rose-500" },
  ],
};

const REINTENTOS_BY_PERIOD: Record<DataPeriodId, { pct: number; n: number }> = {
  "24h": { pct: 2.3, n: 3 },
  "7d": { pct: 2.1, n: 18 },
  "30d": { pct: 1.9, n: 72 },
  "90d": { pct: 2.0, n: 212 },
};

const CUMPLIMIENTO_BY_PERIOD: Record<DataPeriodId, { pct: number; delta: number }> = {
  "24h": { pct: 97.6, delta: 1.2 },
  "7d": { pct: 96.8, delta: 0.6 },
  "30d": { pct: 96.4, delta: 0.4 },
  "90d": { pct: 95.9, delta: -0.1 },
};

const HORAS_BY_PERIOD: Record<DataPeriodId, Array<{ h: string; ordenes: number }>> = {
  "24h": [
    "00:00",
    "02:00",
    "04:00",
    "06:00",
    "08:00",
    "10:00",
    "12:00",
    "14:00",
    "16:00",
    "18:00",
    "20:00",
    "22:00",
  ].map((h, i) => ({
    h,
    ordenes: [22, 18, 15, 28, 72, 128, 162, 158, 148, 118, 76, 42][i],
  })),
  "7d": ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d, i) => ({
    h: d,
    ordenes: [820, 910, 880, 950, 1020, 640, 420][i],
  })),
  "30d": Array.from({ length: 6 }, (_, i) => ({
    h: `Sem ${i + 1}`,
    ordenes: [4200, 4480, 4310, 4720, 4910, 4560][i],
  })),
  "90d": ["Mar", "Abr", "May"].map((m, i) => ({ h: m, ordenes: [18800, 19420, 20140][i] })),
};

const PRIORIDAD_BY_PERIOD: Record<DataPeriodId, { alta: number; media: number; baja: number }> = {
  "24h": { alta: 45, media: 48, baja: 32 },
  "7d": { alta: 312, media: 340, baja: 218 },
  "30d": { alta: 1280, media: 1410, baja: 920 },
  "90d": { alta: 3920, media: 4310, baja: 2780 },
};

// histórico sintético (en producción vendría del backend filtrado por rango)
type HistRow = {
  offsetH: number;
  orden: string;
  producto: string;
  qty: number;
  priority: Priority;
  state: OrderState;
  rover: string;
  tiempo: string;
  queue: string;
  motivo: string;
};
// offsetH = horas atrás desde "ahora"; cubre 24h / 7d / 30d / 90d para que cada período muestre filas
const HISTORICO: HistRow[] = [
  // últimas 24h
  {
    offsetH: 1,
    orden: "OR-12511",
    producto: "SKU-A102 · Caja 24u",
    qty: 2,
    priority: "alta",
    state: "completed",
    rover: "R-01",
    tiempo: "16 min",
    queue: "4 min",
    motivo: "—",
  },
  {
    offsetH: 3,
    orden: "OR-12510",
    producto: "SKU-B441 · Pallet",
    qty: 1,
    priority: "alta",
    state: "completed",
    rover: "R-02",
    tiempo: "21 min",
    queue: "6 min",
    motivo: "—",
  },
  {
    offsetH: 6,
    orden: "OR-12509",
    producto: "SKU-C019 · Caja 12u",
    qty: 5,
    priority: "media",
    state: "cancelled",
    rover: "R-03",
    tiempo: "—",
    queue: "12 min",
    motivo: "Producto no encontrado",
  },
  {
    offsetH: 10,
    orden: "OR-12508",
    producto: "SKU-D227 · Bulto",
    qty: 2,
    priority: "baja",
    state: "completed",
    rover: "R-04",
    tiempo: "14 min",
    queue: "3 min",
    motivo: "—",
  },
  {
    offsetH: 14,
    orden: "OR-12507",
    producto: "SKU-E308 · Pallet",
    qty: 1,
    priority: "alta",
    state: "completed",
    rover: "R-01",
    tiempo: "18 min",
    queue: "5 min",
    motivo: "—",
  },
  {
    offsetH: 18,
    orden: "OR-12506",
    producto: "SKU-A102 · Caja 24u",
    qty: 3,
    priority: "media",
    state: "completed",
    rover: "R-02",
    tiempo: "15 min",
    queue: "2 min",
    motivo: "—",
  },
  {
    offsetH: 22,
    orden: "OR-12505",
    producto: "SKU-B441 · Pallet",
    qty: 1,
    priority: "baja",
    state: "completed",
    rover: "R-05",
    tiempo: "22 min",
    queue: "9 min",
    motivo: "—",
  },
  // 1 - 7 días
  {
    offsetH: 30,
    orden: "OR-12498",
    producto: "SKU-C019 · Caja 12u",
    qty: 4,
    priority: "media",
    state: "cancelled",
    rover: "R-03",
    tiempo: "—",
    queue: "8 min",
    motivo: "Stock insuficiente",
  },
  {
    offsetH: 48,
    orden: "OR-12492",
    producto: "SKU-A102 · Caja 24u",
    qty: 6,
    priority: "alta",
    state: "completed",
    rover: "R-01",
    tiempo: "17 min",
    queue: "5 min",
    motivo: "—",
  },
  {
    offsetH: 72,
    orden: "OR-12485",
    producto: "SKU-D227 · Bulto",
    qty: 2,
    priority: "media",
    state: "completed",
    rover: "R-04",
    tiempo: "13 min",
    queue: "2 min",
    motivo: "—",
  },
  {
    offsetH: 96,
    orden: "OR-12478",
    producto: "SKU-E308 · Pallet",
    qty: 1,
    priority: "baja",
    state: "completed",
    rover: "R-02",
    tiempo: "19 min",
    queue: "7 min",
    motivo: "—",
  },
  {
    offsetH: 120,
    orden: "OR-12470",
    producto: "SKU-B441 · Pallet",
    qty: 3,
    priority: "alta",
    state: "cancelled",
    rover: "R-05",
    tiempo: "—",
    queue: "15 min",
    motivo: "Rover sin batería",
  },
  {
    offsetH: 144,
    orden: "OR-12461",
    producto: "SKU-A102 · Caja 24u",
    qty: 2,
    priority: "media",
    state: "completed",
    rover: "R-03",
    tiempo: "16 min",
    queue: "4 min",
    motivo: "—",
  },
  // 7 - 30 días
  {
    offsetH: 240,
    orden: "OR-12420",
    producto: "SKU-C019 · Caja 12u",
    qty: 4,
    priority: "baja",
    state: "completed",
    rover: "R-01",
    tiempo: "20 min",
    queue: "6 min",
    motivo: "—",
  },
  {
    offsetH: 360,
    orden: "OR-12380",
    producto: "SKU-D227 · Bulto",
    qty: 1,
    priority: "alta",
    state: "completed",
    rover: "R-02",
    tiempo: "14 min",
    queue: "3 min",
    motivo: "—",
  },
  {
    offsetH: 480,
    orden: "OR-12340",
    producto: "SKU-E308 · Pallet",
    qty: 2,
    priority: "media",
    state: "cancelled",
    rover: "R-04",
    tiempo: "—",
    queue: "10 min",
    motivo: "Pasillo bloqueado",
  },
  {
    offsetH: 600,
    orden: "OR-12300",
    producto: "SKU-A102 · Caja 24u",
    qty: 5,
    priority: "media",
    state: "completed",
    rover: "R-01",
    tiempo: "18 min",
    queue: "5 min",
    motivo: "—",
  },
  {
    offsetH: 720,
    orden: "OR-12250",
    producto: "SKU-B441 · Pallet",
    qty: 1,
    priority: "alta",
    state: "completed",
    rover: "R-05",
    tiempo: "23 min",
    queue: "8 min",
    motivo: "—",
  },
  // 30 - 90 días
  {
    offsetH: 1080,
    orden: "OR-12100",
    producto: "SKU-C019 · Caja 12u",
    qty: 3,
    priority: "media",
    state: "completed",
    rover: "R-03",
    tiempo: "15 min",
    queue: "4 min",
    motivo: "—",
  },
  {
    offsetH: 1440,
    orden: "OR-11950",
    producto: "SKU-D227 · Bulto",
    qty: 2,
    priority: "baja",
    state: "completed",
    rover: "R-02",
    tiempo: "17 min",
    queue: "6 min",
    motivo: "—",
  },
  {
    offsetH: 1800,
    orden: "OR-11800",
    producto: "SKU-A102 · Caja 24u",
    qty: 4,
    priority: "alta",
    state: "cancelled",
    rover: "R-04",
    tiempo: "—",
    queue: "13 min",
    motivo: "Cliente canceló",
  },
  {
    offsetH: 2160,
    orden: "OR-11600",
    producto: "SKU-E308 · Pallet",
    qty: 1,
    priority: "media",
    state: "completed",
    rover: "R-01",
    tiempo: "21 min",
    queue: "7 min",
    motivo: "—",
  },
];

// color tokens for charts — aligned with dashboard palette (oklch)
const COLORS = {
  teal: "oklch(0.78 0.18 180)", // primary
  amber: "oklch(0.78 0.18 80)", // warning
  orange: "oklch(0.72 0.18 50)", // accent warm
  red: "oklch(0.65 0.24 27)", // destructive
  blue: "oklch(0.65 0.15 250)", // info
  muted: "oklch(0.65 0.05 250)",
  track: "oklch(0.92 0.01 250)",
} as const;
const STATE_COLOR: Record<OrderState, string> = {
  pending: COLORS.blue,
  in_progress: COLORS.amber,
  completed: COLORS.teal,
  cancelled: COLORS.red,
};
const PRIORITY_COLOR: Record<Priority, string> = {
  alta: COLORS.red,
  media: COLORS.amber,
  baja: COLORS.muted,
};

// Mapa de órdenes con múltiples productos (mock). Las órdenes no listadas
// aquí se consideran de un único producto (su .product / .qty).
const MULTI_ITEMS: Record<string, Array<{ sku: string; qty: number }>> = {
  "OR-12504": [
    { sku: "SKU-A102 · Caja 24u", qty: 3 },
    { sku: "SKU-B441 · Pallet", qty: 2 },
    { sku: "SKU-C019 · Caja 12u", qty: 4 },
  ],
  "OR-12511": [
    { sku: "SKU-C019 · Caja 12u", qty: 5 },
    { sku: "SKU-D227 · Bulto", qty: 1 },
  ],
  "OR-12517": [
    { sku: "SKU-E308 · Pallet", qty: 1 },
    { sku: "SKU-A102 · Caja 24u", qty: 6 },
    { sku: "SKU-B441 · Pallet", qty: 1 },
    { sku: "SKU-D227 · Bulto", qty: 2 },
  ],
};

function getOrderItems(o: { id: string; product: string; qty: number }) {
  const items = MULTI_ITEMS[o.id];
  if (items && items.length > 1) {
    return { items, total: items.reduce((s, i) => s + i.qty, 0), multi: true as const };
  }
  return { items: [{ sku: o.product, qty: o.qty }], total: o.qty, multi: false as const };
}

function OrdenesPage() {
  const { data: ordersRaw } = useOrders();
  const orders = useMemo(
    () =>
      ordersRaw.map((o) => ({ ...o, state: (LEGACY_STATE_MAP[o.state] ?? o.state) as OrderState })),
    [ordersRaw],
  );

  const [period, setPeriod] = useState<PeriodId>("24h");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<Set<Priority>>(
    new Set(PRIORITY_FILTERS.map((p) => p.id)),
  );
  const [stateFilter, setStateFilter] = useState<Set<OrderState>>(
    new Set(STATE_FILTERS.map((s) => s.id)),
  );
  const [tableTab, setTableTab] = useState<"todas" | OrderState>("todas");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const dataPeriod: DataPeriodId = useMemo(() => {
    if (period !== "custom") return period;
    if (!customRange?.from || !customRange?.to) return "30d";
    const days = Math.ceil((customRange.to.getTime() - customRange.from.getTime()) / 86_400_000);
    if (days <= 1) return "24h";
    if (days <= 7) return "7d";
    if (days <= 30) return "30d";
    return "90d";
  }, [period, customRange]);

  const kpis = { ...KPIS_BY_PERIOD[dataPeriod], total: orders.length };
  const aging = AGING_BY_PERIOD[dataPeriod];
  const reintentos = REINTENTOS_BY_PERIOD[dataPeriod];
  const horas = HORAS_BY_PERIOD[dataPeriod];

  // Real distribution from API
  const distribucion: Record<OrderState, number> = useMemo(
    () => ({
      pending: orders.filter((o) => o.state === "pending").length,
      in_progress: orders.filter((o) => o.state === "in_progress").length,
      completed: orders.filter((o) => o.state === "completed").length,
      cancelled: orders.filter((o) => o.state === "cancelled").length,
    }),
    [orders],
  );

  const distTotal = (Object.values(distribucion) as number[]).reduce((a, b) => a + b, 0);
  const distData = (Object.keys(distribucion) as OrderState[]).map((k) => ({
    name: STATE_LABELS[k],
    key: k,
    value: distribucion[k],
  }));
  const agingMax = Math.max(...aging.map((a) => a.value));

  // Real cumplimiento from API
  const cumplimiento = useMemo(() => {
    const comp = orders.filter((o) => o.state === "completed").length;
    const canc = orders.filter((o) => o.state === "cancelled").length;
    return {
      pct: comp + canc > 0 ? Math.round((comp / (comp + canc)) * 100) : 100,
      delta: 0,
    };
  }, [orders]);

  // Real priority distribution from API
  const prioridad = useMemo(
    () => ({
      alta: orders.filter((o) => o.priority?.toLowerCase() === "alta").length,
      media: orders.filter((o) => !["alta", "baja"].includes(o.priority?.toLowerCase() ?? ""))
        .length,
      baja: orders.filter((o) => o.priority?.toLowerCase() === "baja").length,
    }),
    [orders],
  );

  const prioTotal = prioridad.alta + prioridad.media + prioridad.baja;
  const prioData = [
    { name: "Alta", key: "alta" as Priority, value: prioridad.alta },
    { name: "Media", key: "media" as Priority, value: prioridad.media },
    { name: "Baja", key: "baja" as Priority, value: prioridad.baja },
  ];

  const filteredTable = useMemo(
    () =>
      orders.filter((o) => {
        if (tableTab !== "todas" && o.state !== tableTab) return false;
        if (!priorityFilter.has(o.priority as Priority)) return false;
        if (!stateFilter.has(o.state as OrderState)) return false;
        if (q && !`${o.id} ${o.product} ${o.rover}`.toLowerCase().includes(q.toLowerCase()))
          return false;
        return true;
      }),
    [orders, tableTab, priorityFilter, stateFilter, q],
  );

  const histBounds = useMemo<{ from?: number; to?: number }>(() => {
    if (period === "custom") {
      return {
        from: customRange?.from?.getTime(),
        to: customRange?.to ? customRange.to.getTime() + 86_400_000 : undefined,
      };
    }
    const now = Date.now();
    const days = period === "24h" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : 90;
    return { from: now - days * 86_400_000, to: now };
  }, [period, customRange]);

  const filteredHist = useMemo(() => {
    const now = Date.now();
    return HISTORICO.map((h) => ({ ...h, t: now - h.offsetH * 3_600_000 }))
      .filter((h) => {
        if (!priorityFilter.has(h.priority)) return false;
        if (!stateFilter.has(h.state)) return false;
        if (histBounds.from !== undefined && h.t < histBounds.from) return false;
        if (histBounds.to !== undefined && h.t > histBounds.to) return false;
        return true;
      })
      .map((h) => ({ ...h, fecha: format(new Date(h.t), "dd/MM/yyyy HH:mm") }));
  }, [priorityFilter, stateFilter, histBounds]);

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
        <FilterMenu
          priority={priorityFilter}
          onPriority={setPriorityFilter}
          state={stateFilter}
          onState={setStateFilter}
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Gauge}
          label="Órdenes / hora"
          value={kpis.ordHora.toString()}
          sub={`${kpis.ordHoraDelta >= 0 ? "+" : ""}${kpis.ordHoraDelta}% vs ayer`}
          tone="primary"
          positive={kpis.ordHoraDelta >= 0}
        />
        <KpiCard
          icon={Timer}
          label="Cycle time prom."
          value={`${kpis.cycle} min`}
          sub={`${kpis.cycleDelta >= 0 ? "+" : ""}${kpis.cycleDelta} min vs ayer`}
          tone="warning"
          positive={kpis.cycleDelta <= 0}
        />
        <KpiCard
          icon={ShieldCheck}
          label="SLA compliance"
          value={`${kpis.sla}%`}
          sub={`${kpis.slaDelta >= 0 ? "+" : ""}${kpis.slaDelta}% vs ayer`}
          tone="success"
          positive={kpis.slaDelta >= 0}
        />
        <KpiCard
          icon={ListChecks}
          label="Órdenes totales"
          value={kpis.total.toLocaleString("es-AR")}
          sub="Total en el período"
          tone="info"
          positive
        />
      </div>

      {/* Fila 2 — distribución + aging + reintentos + cumplimiento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel title="Distribución por estado">
          <div className="flex items-center gap-3">
            <div className="relative w-[140px] h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distData}
                    dataKey="value"
                    innerRadius={42}
                    outerRadius={62}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {distData.map((d) => (
                      <Cell key={d.key} fill={STATE_COLOR[d.key]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold">{distTotal.toLocaleString("es-AR")}</span>
                <span className="text-[10px] text-muted-foreground">Total</span>
              </div>
            </div>
            <div className="flex-1 text-[11px] space-y-1.5">
              {distData.map((d) => {
                const pct = distTotal ? Math.round((d.value / distTotal) * 100) : 0;
                return (
                  <div key={d.key} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-sm"
                        style={{ background: STATE_COLOR[d.key] }}
                      />
                      {d.name}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {d.value} <span className="opacity-60">({pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        <Panel
          title="Aging de órdenes"
          action={<span className="text-[11px] text-muted-foreground">(espera)</span>}
        >
          <div className="space-y-2.5 mt-1">
            {aging.map((a) => (
              <div key={a.bucket} className="flex items-center gap-3 text-[11px]">
                <span className="w-20 text-muted-foreground">{a.bucket}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${a.tone}`}
                    style={{ width: `${agingMax ? (a.value / agingMax) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-8 text-right tabular-nums">{a.value}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="self-start" title="Tasa de cumplimiento">
          <div className="flex flex-col items-center justify-center py-4">
            <span className="text-3xl font-bold">{cumplimiento.pct}%</span>
            <span
              className={cn(
                "text-[11px] mt-1",
                cumplimiento.delta >= 0 ? "text-emerald-500" : "text-destructive",
              )}
            >
              {cumplimiento.delta >= 0 ? "+" : ""}
              {cumplimiento.delta}% vs ayer
            </span>
          </div>
        </Panel>
      </div>

      {/* Cola de órdenes + Órdenes por hora */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel
          className="lg:col-span-2"
          title="Cola de órdenes"
          subtitle={`${filteredTable.length} resultados`}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <TableTabs value={tableTab} onChange={setTableTab} />
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-secondary/40 focus:outline-none focus:border-primary w-40"
                />
              </div>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <Th>Orden</Th>
                  <Th>Producto</Th>
                  <Th className="text-right">Cant.</Th>
                  <Th>Prioridad</Th>
                  <Th>Estado</Th>
                  <Th>Rover</Th>
                </tr>
              </thead>
              <tbody>
                {filteredTable.map((o) => {
                  const { items, total, multi } = getOrderItems(o);
                  const isOpen = expanded.has(o.id);
                  return (
                    <Fragment key={o.id}>
                      <tr
                        onClick={() => multi && toggleExpanded(o.id)}
                        className={cn(
                          "border-b border-border/50 hover:bg-secondary/30",
                          multi && "cursor-pointer",
                        )}
                      >
                        <td className="py-3 px-2 text-xs font-bold">
                          <span className="inline-flex items-center gap-1.5">
                            {multi ? (
                              isOpen ? (
                                <ChevronDown className="w-3 h-3 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                              )
                            ) : (
                              <span className="w-3 h-3 inline-block" />
                            )}
                            {o.id}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-xs text-muted-foreground">
                          {multi ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-foreground font-medium">Productos</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/60 border border-border tabular-nums">
                                {items.length}
                              </span>
                            </span>
                          ) : (
                            o.product
                          )}
                        </td>
                        <td className="py-3 px-2 text-xs text-right tabular-nums">×{total}</td>
                        <td className="py-3 px-2">
                          <PriorityBadge p={o.priority as Priority} />
                        </td>
                        <td className="py-3 px-2">
                          <StateBadge s={o.state as OrderState} />
                        </td>
                        <td className="py-3 px-2 text-xs">{o.rover}</td>
                      </tr>
                      {multi && isOpen && (
                        <tr className="border-b border-border/50 bg-secondary/20">
                          <td></td>
                          <td colSpan={5} className="py-2 px-2">
                            <ul className="space-y-1.5 pl-1">
                              {items.map((it) => (
                                <li
                                  key={it.sku}
                                  className="flex items-center justify-between text-xs"
                                >
                                  <span className="text-muted-foreground">{it.sku}</span>
                                  <span className="tabular-nums text-foreground/80 pr-1">
                                    ×{it.qty}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filteredTable.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                      Sin órdenes para los filtros seleccionados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          className="self-start"
          title="Órdenes por hora"
          action={<PeriodLabelView value={period} range={customRange} />}
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={horas}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="h" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="ordenes"
                  stroke={COLORS.amber}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  name="Órdenes"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Histórico + Prioridad */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel
          className="lg:col-span-2"
          title="Histórico de órdenes"
          action={
            <div className="flex items-center gap-2">
              <PeriodLabelView value={period} range={customRange} />
              <button className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-border bg-secondary/40 hover:bg-secondary/60">
                <Download className="w-3 h-3" />
                Exportar
              </button>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <Th>Fecha / hora</Th>
                  <Th>Orden</Th>
                  <Th>Producto</Th>
                  <Th className="text-right">Cant.</Th>
                  <Th>Prioridad</Th>
                  <Th>Estado final</Th>
                  <Th>Rover</Th>
                  <Th className="text-right">Tiempo ciclo</Th>
                  <Th className="text-right">Queue time</Th>
                  <Th>Motivo falla</Th>
                </tr>
              </thead>
              <tbody>
                {filteredHist.map((h) => (
                  <tr key={h.orden} className="border-b border-border/50 hover:bg-secondary/30">
                    <td className="py-3 px-2 text-[11px] text-muted-foreground whitespace-nowrap">
                      {h.fecha}
                    </td>
                    <td className="py-3 px-2 text-xs font-bold">{h.orden}</td>
                    <td className="py-3 px-2 text-xs text-muted-foreground">{h.producto}</td>
                    <td className="py-3 px-2 text-xs text-right">×{h.qty}</td>
                    <td className="py-3 px-2">
                      <PriorityBadge p={h.priority} />
                    </td>
                    <td className="py-3 px-2">
                      <StateBadge s={h.state} />
                    </td>
                    <td className="py-3 px-2 text-xs">{h.rover}</td>
                    <td className="py-3 px-2 text-xs text-right tabular-nums">{h.tiempo}</td>
                    <td className="py-3 px-2 text-xs text-right tabular-nums">{h.queue}</td>
                    <td className="py-3 px-2 text-[11px] text-muted-foreground">{h.motivo}</td>
                  </tr>
                ))}
                {filteredHist.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-xs text-muted-foreground">
                      Sin registros para el rango seleccionado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          className="self-start"
          title="Órdenes por prioridad"
          action={<PeriodLabelView value={period} range={customRange} />}
        >
          <div className="flex items-center gap-3">
            <div className="relative w-[140px] h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={prioData}
                    dataKey="value"
                    innerRadius={42}
                    outerRadius={62}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {prioData.map((d) => (
                      <Cell key={d.key} fill={PRIORITY_COLOR[d.key]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold">{prioTotal.toLocaleString("es-AR")}</span>
                <span className="text-[10px] text-muted-foreground">Total</span>
              </div>
            </div>
            <div className="flex-1 text-[11px] space-y-1.5">
              {prioData.map((d) => {
                const pct = prioTotal ? Math.round((d.value / prioTotal) * 100) : 0;
                return (
                  <div key={d.key} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-sm"
                        style={{ background: PRIORITY_COLOR[d.key] }}
                      />
                      {d.name}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {d.value} <span className="opacity-60">({pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// --- subcomponents ---

function Panel({
  title,
  subtitle,
  action,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
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
  sub,
  tone,
  positive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  tone: string;
  positive: boolean;
}) {
  const toneCls: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-500 bg-emerald-500/10",
    warning: "text-warning bg-warning/10",
    info: "text-info bg-info/10",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-7 h-7 rounded-md flex items-center justify-center ${toneCls[tone] ?? "text-primary bg-primary/10"}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className={cn("text-[10px] mt-1", positive ? "text-emerald-500" : "text-destructive")}>
        {sub}
      </p>
    </div>
  );
}

function PriorityBadge({ p }: { p: Priority }) {
  const map: Record<Priority, string> = {
    alta: "border-destructive/30 bg-destructive/10 text-destructive",
    media: "border-warning/30 bg-warning/10 text-warning",
    baja: "border-border bg-secondary text-muted-foreground",
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${map[p]}`}>{p}</span>;
}

function StateBadge({ s }: { s: OrderState }) {
  const map: Record<OrderState, string> = {
    in_progress: "border-primary/30 bg-primary/10 text-primary",
    pending: "border-info/40 bg-info/10 text-info",
    completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${map[s]}`}>
      {STATE_LABELS[s]}
    </span>
  );
}

function TableTabs({
  value,
  onChange,
}: {
  value: "todas" | OrderState;
  onChange: (v: "todas" | OrderState) => void;
}) {
  const tabs: Array<{ id: "todas" | OrderState; label: string }> = [
    { id: "todas", label: "Todas" },
    { id: "in_progress", label: "In progress" },
    { id: "pending", label: "Pending" },
  ];
  return (
    <div className="flex items-center gap-1 p-0.5 rounded-md border border-border bg-secondary/30">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "px-2.5 py-1 text-[11px] rounded transition-colors",
            value === t.id
              ? "bg-warning text-warning-foreground font-medium"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
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

function RangePicker({
  range,
  onRangeChange,
}: {
  range?: DateRange;
  onRangeChange: (r: DateRange | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const label =
    range?.from && range?.to
      ? `${format(range.from, "dd/MM/yyyy")} – ${format(range.to, "dd/MM/yyyy")}`
      : range?.from
        ? `Desde ${format(range.from, "dd/MM/yyyy")}`
        : "Todo el período";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border border-border bg-card hover:bg-secondary/40 px-3 py-1.5 text-[11px]">
          <CalendarIcon className="w-3.5 h-3.5" /> {label} <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2">
        <Calendar
          mode="range"
          selected={range}
          onSelect={onRangeChange}
          numberOfMonths={2}
          locale={es}
          className="p-2 pointer-events-auto"
        />
        <div className="flex justify-between px-2 pb-1">
          <button
            onClick={() => {
              onRangeChange(undefined);
              setOpen(false);
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Limpiar
          </button>
          <button
            onClick={() => setOpen(false)}
            disabled={!range?.from || !range?.to}
            className="text-[11px] text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
          >
            Aplicar ›
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterMenu({
  priority,
  onPriority,
  state,
  onState,
}: {
  priority: Set<Priority>;
  onPriority: (s: Set<Priority>) => void;
  state: Set<OrderState>;
  onState: (s: Set<OrderState>) => void;
}) {
  const togglePriority = (id: Priority) => {
    const next = new Set(priority);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onPriority(next);
  };
  const toggleState = (id: OrderState) => {
    const next = new Set(state);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onState(next);
  };
  const totalActive =
    (priority.size < PRIORITY_FILTERS.length ? PRIORITY_FILTERS.length - priority.size : 0) +
    (state.size < STATE_FILTERS.length ? STATE_FILTERS.length - state.size : 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-secondary/40 text-xs">
          <Filter className="w-3.5 h-3.5" /> Filtros
          {totalActive > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px]">
              {totalActive}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">
          Prioridad
        </p>
        {PRIORITY_FILTERS.map((s) => (
          <CheckRow
            key={s.id}
            on={priority.has(s.id)}
            label={s.label}
            onClick={() => togglePriority(s.id)}
          />
        ))}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mt-3 mb-1">
          Estado
        </p>
        {STATE_FILTERS.map((s) => (
          <CheckRow
            key={s.id}
            on={state.has(s.id)}
            label={s.label}
            onClick={() => toggleState(s.id)}
          />
        ))}
        <div className="flex justify-between mt-2 pt-2 border-t border-border">
          <button
            onClick={() => {
              onPriority(new Set());
              onState(new Set());
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground px-1"
          >
            Limpiar
          </button>
          <button
            onClick={() => {
              onPriority(new Set(PRIORITY_FILTERS.map((p) => p.id)));
              onState(new Set(STATE_FILTERS.map((s) => s.id)));
            }}
            className="text-[11px] text-primary hover:underline px-1"
          >
            Todos
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CheckRow({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-secondary/60"
    >
      <span
        className={`w-3.5 h-3.5 rounded border ${on ? "bg-primary border-primary" : "border-border"} flex items-center justify-center`}
      >
        {on && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
      </span>
      {label}
    </button>
  );
}
