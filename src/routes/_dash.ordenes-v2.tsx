import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  Calendar as CalendarIcon, Filter, Download, Search,
  ChevronDown, ChevronRight, Check, Gauge, Timer, ShieldCheck, ListChecks,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
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
  { id: "24h",    label: "Últimas 24 horas" },
  { id: "7d",     label: "Últimos 7 días" },
  { id: "30d",    label: "Últimos 30 días" },
  { id: "90d",    label: "Últimos 90 días" },
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
  "en espera":  "pending",
  "completada": "completed",
  "cancelada":  "cancelled",
};

const STATE_FILTERS: { id: OrderState; label: string }[] = (Object.keys(STATE_LABELS) as OrderState[]).map((id) => ({ id, label: STATE_LABELS[id] }));

function periodLabel(value: PeriodId, range?: DateRange) {
  if (value === "custom") {
    if (range?.from && range?.to) return `${format(range.from, "dd/MM/yy")} – ${format(range.to, "dd/MM/yy")}`;
    if (range?.from) return `Desde ${format(range.from, "dd/MM/yy")}`;
    return "Rango personalizado";
  }
  return PERIOD_OPTIONS.find((p) => p.id === value)!.label;
}

// TODO: tasa de reintentos — endpoint no existe en RFC
const REINTENTOS_BY_PERIOD: Record<DataPeriodId, { pct: number; n: number }> = {
  "24h": { pct: 2.3, n: 3 },
  "7d":  { pct: 2.1, n: 18 },
  "30d": { pct: 1.9, n: 72 },
  "90d": { pct: 2.0, n: 212 },
};

// TODO: campo priority no existe en RFC — donut mockeado
const PRIORIDAD_BY_PERIOD: Record<DataPeriodId, { alta: number; media: number; baja: number }> = {
  "24h": { alta: 45, media: 48, baja: 32 },
  "7d":  { alta: 312, media: 340, baja: 218 },
  "30d": { alta: 1280, media: 1410, baja: 920 },
  "90d": { alta: 3920, media: 4310, baja: 2780 },
};

const _ORD_DAY = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
const _ORD_MON = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"] as const;

// Item 33: agrupa completedAt por franja horaria según el período
function buildHoras(
  orders: Array<{ state: string; completedAt?: string }>,
  period: DataPeriodId,
): Array<{ h: string; ordenes: number }> {
  const done = orders.filter((o) => o.state === "completed" && o.completedAt);

  if (period === "24h") {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: 12 }, (_, i) => {
      const h = i * 2;
      const s = today.getTime() + h * 3_600_000;
      return { h: `${String(h).padStart(2, "0")}:00`, ordenes: done.filter((o) => { const t = new Date(o.completedAt!).getTime(); return t >= s && t < s + 7_200_000; }).length };
    });
  }

  if (period === "7d") {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i));
      const s = d.getTime();
      return { h: _ORD_DAY[d.getDay()], ordenes: done.filter((o) => { const t = new Date(o.completedAt!).getTime(); return t >= s && t < s + 86_400_000; }).length };
    });
  }

  if (period === "30d") {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(); d.setHours(23, 59, 59, 999); d.setDate(d.getDate() - i * 7);
      const e = d.getTime(); const s = e - 7 * 86_400_000 + 1;
      return { h: `Sem ${6 - i}`, ordenes: done.filter((o) => { const t = new Date(o.completedAt!).getTime(); return t >= s && t <= e; }).length };
    }).reverse();
  }

  // 90d: últimos 3 meses
  const now = new Date();
  return Array.from({ length: 3 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (2 - i), 1);
    const s = d.getTime(); const e = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    return { h: _ORD_MON[d.getMonth()], ordenes: done.filter((o) => { const t = new Date(o.completedAt!).getTime(); return t >= s && t <= e; }).length };
  });
}

// color tokens for charts — aligned with dashboard palette (oklch)
const COLORS = {
  teal:    "oklch(0.78 0.18 180)", // primary
  amber:   "oklch(0.78 0.18 80)",  // warning
  orange:  "oklch(0.72 0.18 50)",  // accent warm
  red:     "oklch(0.65 0.24 27)",  // destructive
  blue:    "oklch(0.65 0.15 250)", // info
  muted:   "oklch(0.65 0.05 250)",
  track:   "oklch(0.92 0.01 250)",
} as const;
const STATE_COLOR: Record<OrderState, string> = {
  pending:     COLORS.blue,
  in_progress: COLORS.amber,
  completed:   COLORS.teal,
  cancelled:   COLORS.red,
};
const PRIORITY_COLOR: Record<Priority, string> = {
  alta:  COLORS.red,
  media: COLORS.amber,
  baja:  COLORS.muted,
};

// Mapa de órdenes con múltiples productos (mock). Las órdenes no listadas
// aquí se consideran de un único producto (su .product / .qty).
const MULTI_ITEMS: Record<string, Array<{ sku: string; qty: number }>> = {
  "OR-12504": [
    { sku: "SKU-A102 · Caja 24u", qty: 3 },
    { sku: "SKU-B441 · Pallet",   qty: 2 },
    { sku: "SKU-C019 · Caja 12u", qty: 4 },
  ],
  "OR-12511": [
    { sku: "SKU-C019 · Caja 12u", qty: 5 },
    { sku: "SKU-D227 · Bulto",    qty: 1 },
  ],
  "OR-12517": [
    { sku: "SKU-E308 · Pallet",   qty: 1 },
    { sku: "SKU-A102 · Caja 24u", qty: 6 },
    { sku: "SKU-B441 · Pallet",   qty: 1 },
    { sku: "SKU-D227 · Bulto",    qty: 2 },
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
    () => ordersRaw.map((o) => ({ ...o, state: (LEGACY_STATE_MAP[o.state] ?? o.state) as OrderState })),
    [ordersRaw],
  );

  const [period, setPeriod] = useState<PeriodId>("24h");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [stateFilter, setStateFilter] = useState<Set<OrderState>>(new Set(STATE_FILTERS.map((s) => s.id)));
  const [tableTab, setTableTab] = useState<"todas" | OrderState>("todas");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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

  const histBounds = useMemo<{ from?: number; to?: number }>(() => {
    if (period === "custom") {
      return { from: customRange?.from?.getTime(), to: customRange?.to ? customRange.to.getTime() + 86_400_000 : undefined };
    }
    const now = Date.now();
    const days = period === "24h" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : 90;
    return { from: now - days * 86_400_000, to: now };
  }, [period, customRange]);

  // Métricas reales computadas desde GET /orders
  const { kpis, distribucion, aging, cumplimiento, horas } = useMemo(() => {
    const now = Date.now();
    const SLA_MIN = 30; // umbral SLA en minutos

    // Órdenes del período seleccionado (filtra por createdAt si existe)
    const periodOrders = histBounds.from
      ? orders.filter((o) => {
          if (!o.createdAt) return true;
          const t = new Date(o.createdAt).getTime();
          return t >= histBounds.from! && t <= (histBounds.to ?? now);
        })
      : orders;

    const completed = periodOrders.filter((o) => o.state === "completed");
    const cancelled = periodOrders.filter((o) => o.state === "cancelled");

    // Item 25 — órdenes completadas en la última hora
    const ordHora = orders.filter((o) =>
      o.state === "completed" && o.completedAt &&
      new Date(o.completedAt).getTime() >= now - 3_600_000,
    ).length;
    const ordHoraPrev = orders.filter((o) => {
      if (o.state !== "completed" || !o.completedAt) return false;
      const t = new Date(o.completedAt).getTime();
      return t >= now - 7_200_000 && t < now - 3_600_000;
    }).length;
    const ordHoraDelta = ordHoraPrev > 0 ? Math.round(((ordHora - ordHoraPrev) / ordHoraPrev) * 100) : 0;

    // Item 26 — cycle time promedio (completed_at - created_at)
    const withTime = completed.filter((o) => o.completedAt && o.createdAt);
    const cycleTimes = withTime.map((o) =>
      (new Date(o.completedAt!).getTime() - new Date(o.createdAt!).getTime()) / 60_000,
    );
    const avgCycle = cycleTimes.length > 0
      ? +(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length).toFixed(1)
      : 0;

    // Item 27 — SLA compliance
    const slaOk = withTime.filter((o) => {
      const min = (new Date(o.completedAt!).getTime() - new Date(o.createdAt!).getTime()) / 60_000;
      return min <= SLA_MIN;
    }).length;
    const sla = withTime.length > 0 ? +((slaOk / withTime.length) * 100).toFixed(1) : 0;

    // Item 28 — total en el período
    const total = periodOrders.length;

    // Item 29 — distribución por estado
    const distribucion: Record<OrderState, number> = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
    periodOrders.forEach((o) => { if (o.state in distribucion) distribucion[o.state as OrderState]++; });

    // Item 30 — aging de órdenes pendientes (cola actual, no período)
    const agingBuckets = [
      { bucket: "< 5 min",     tone: "bg-emerald-500", value: 0 },
      { bucket: "5 - 15 min",  tone: "bg-emerald-500", value: 0 },
      { bucket: "15 - 30 min", tone: "bg-amber-400",   value: 0 },
      { bucket: "30 - 60 min", tone: "bg-amber-500",   value: 0 },
      { bucket: "> 60 min",    tone: "bg-rose-500",     value: 0 },
    ];
    orders.filter((o) => o.state === "pending" && o.createdAt).forEach((o) => {
      const m = (now - new Date(o.createdAt!).getTime()) / 60_000;
      if (m < 5) agingBuckets[0].value++;
      else if (m < 15) agingBuckets[1].value++;
      else if (m < 30) agingBuckets[2].value++;
      else if (m < 60) agingBuckets[3].value++;
      else agingBuckets[4].value++;
    });

    // Item 31 — tasa de cumplimiento
    const cumplTotal = completed.length + cancelled.length;
    const cumplPct = cumplTotal > 0 ? +((completed.length / cumplTotal) * 100).toFixed(1) : 0;

    // Item 33 — órdenes por hora
    const horas = buildHoras(orders, dataPeriod);

    return {
      kpis: { ordHora, ordHoraDelta, cycle: avgCycle, sla, total },
      distribucion,
      aging: agingBuckets,
      cumplimiento: { pct: cumplPct },
      horas,
    };
  }, [orders, histBounds, dataPeriod]);

  const reintentos = REINTENTOS_BY_PERIOD[dataPeriod]; // TODO: endpoint no existe en RFC
  const prioridad   = PRIORIDAD_BY_PERIOD[dataPeriod]; // TODO: campo priority no existe en RFC

  const distTotal = (Object.values(distribucion) as number[]).reduce((a, b) => a + b, 0);
  const distData = (Object.keys(distribucion) as OrderState[]).map((k) => ({ name: STATE_LABELS[k], key: k, value: distribucion[k] }));
  const agingMax = Math.max(1, ...aging.map((a) => a.value));

  const prioTotal = prioridad.alta + prioridad.media + prioridad.baja;
  const prioData = [
    { name: "Alta",  key: "alta"  as Priority, value: prioridad.alta  },
    { name: "Media", key: "media" as Priority, value: prioridad.media },
    { name: "Baja",  key: "baja"  as Priority, value: prioridad.baja  },
  ];

  // Item 32 — cola de órdenes (datos reales)
  const filteredTable = useMemo(
    () => orders.filter((o) => {
      if (tableTab !== "todas" && o.state !== tableTab) return false;
      if (!stateFilter.has(o.state as OrderState)) return false;
      if (q && !`${o.id} ${o.product} ${o.rover}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    }),
    [orders, tableTab, stateFilter, q],
  );

  // Item 34 — histórico de órdenes (datos reales con timestamps)
  const filteredHist = useMemo(() => {
    return orders
      .filter((o) => {
        if (!stateFilter.has(o.state as OrderState)) return false;
        if (o.createdAt) {
          const t = new Date(o.createdAt).getTime();
          if (histBounds.from !== undefined && t < histBounds.from) return false;
          if (histBounds.to   !== undefined && t > histBounds.to)   return false;
        }
        return true;
      })
      .map((o) => {
        const cMs = o.createdAt   ? new Date(o.createdAt).getTime()   : null;
        const dMs = o.completedAt ? new Date(o.completedAt).getTime() : null;
        const sMs = o.startedAt   ? new Date(o.startedAt).getTime()   : null;
        return {
          fecha:    cMs ? format(new Date(cMs), "dd/MM/yyyy HH:mm") : "—",
          orden:    o.id,
          producto: o.product,
          qty:      o.qty,
          state:    o.state as OrderState,
          rover:    o.rover,
          tiempo:   dMs && cMs ? `${((dMs - cMs) / 60_000).toFixed(0)} min` : "—",
          queue:    sMs && cMs ? `${((sMs - cMs) / 60_000).toFixed(0)} min` : "—",
          motivo:   o.cancelReason ?? "—",
        };
      });
  }, [orders, stateFilter, histBounds]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-end gap-2 flex-wrap text-xs">
        <PeriodPicker value={period} onChange={setPeriod} range={customRange} onRangeChange={setCustomRange} />
        <FilterMenu state={stateFilter} onState={setStateFilter} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Gauge}       label="Órdenes / hora"   value={kpis.ordHora.toString()}            sub={`${kpis.ordHoraDelta >= 0 ? "+" : ""}${kpis.ordHoraDelta}% vs hora anterior`} tone="primary"  positive={kpis.ordHoraDelta >= 0} />
        <KpiCard icon={Timer}       label="Cycle time prom." value={kpis.cycle > 0 ? `${kpis.cycle} min` : "—"} sub="Prom. completadas en el período"                         tone="warning"  positive />
        <KpiCard icon={ShieldCheck} label="SLA compliance"   value={`${kpis.sla}%`}                   sub="Completadas en ≤ 30 min"                                         tone="success"  positive={kpis.sla >= 95} />
        <KpiCard icon={ListChecks}  label="Órdenes totales"  value={kpis.total.toLocaleString("es-AR")} sub="Total en el período"                                            tone="info"     positive />
      </div>

      {/* Fila 2 — distribución + aging + reintentos + cumplimiento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel title="Distribución por estado">
          <div className="flex items-center gap-3">
            <div className="relative w-[140px] h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distData} dataKey="value" innerRadius={42} outerRadius={62} paddingAngle={2} stroke="none">
                    {distData.map((d) => <Cell key={d.key} fill={STATE_COLOR[d.key]} />)}
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
                      <span className="w-2 h-2 rounded-sm" style={{ background: STATE_COLOR[d.key] }} />
                      {d.name}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{d.value} <span className="opacity-60">({pct}%)</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        <Panel title="Aging de órdenes" action={<span className="text-[11px] text-muted-foreground">(espera)</span>}>
          <div className="space-y-2.5 mt-1">
            {aging.map((a) => (
              <div key={a.bucket} className="flex items-center gap-3 text-[11px]">
                <span className="w-20 text-muted-foreground">{a.bucket}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${a.tone}`} style={{ width: `${agingMax ? (a.value / agingMax) * 100 : 0}%` }} />
                </div>
                <span className="w-8 text-right tabular-nums">{a.value}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="self-start" title="Tasa de cumplimiento">
          <div className="flex flex-col items-center justify-center py-4">
            <span className="text-3xl font-bold">{cumplimiento.pct}%</span>
            <span className="text-[11px] mt-1 text-muted-foreground">
              completadas / (completadas + canceladas)
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
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-secondary/40 focus:outline-none focus:border-primary w-40" />
              </div>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <Th>Orden</Th><Th>Producto</Th><Th className="text-right">Cant.</Th>
                  <Th>Prioridad</Th><Th>Estado</Th><Th>Rover</Th>
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
                              isOpen
                                ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                                : <ChevronRight className="w-3 h-3 text-muted-foreground" />
                            ) : <span className="w-3 h-3 inline-block" />}
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
                          ) : o.product}
                        </td>
                        <td className="py-3 px-2 text-xs text-right tabular-nums">×{total}</td>
                        <td className="py-3 px-2 text-xs text-muted-foreground">—</td>{/* priority: no existe en RFC */}
                        <td className="py-3 px-2"><StateBadge s={o.state as OrderState} /></td>
                        <td className="py-3 px-2 text-xs">{o.rover}</td>
                      </tr>
                      {multi && isOpen && (
                        <tr className="border-b border-border/50 bg-secondary/20">
                          <td></td>
                          <td colSpan={5} className="py-2 px-2">
                            <ul className="space-y-1.5 pl-1">
                              {items.map((it) => (
                                <li key={it.sku} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">{it.sku}</span>
                                  <span className="tabular-nums text-foreground/80 pr-1">×{it.qty}</span>
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
                  <tr><td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">Sin órdenes para los filtros seleccionados</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="self-start" title="Órdenes por hora" action={<PeriodLabelView value={period} range={customRange} />}>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={horas}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="h" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Line type="monotone" dataKey="ordenes" stroke={COLORS.amber} strokeWidth={2} dot={{ r: 2 }} name="Órdenes" />
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
                <Download className="w-3 h-3" />Exportar
              </button>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <Th>Fecha / hora</Th><Th>Orden</Th><Th>Producto</Th><Th className="text-right">Cant.</Th>
                  <Th>Prioridad</Th><Th>Estado final</Th><Th>Rover</Th>
                  <Th className="text-right">Tiempo ciclo</Th><Th className="text-right">Queue time</Th><Th>Motivo falla</Th>
                </tr>
              </thead>
              <tbody>
                {filteredHist.map((h) => (
                  <tr key={h.orden} className="border-b border-border/50 hover:bg-secondary/30">
                    <td className="py-3 px-2 text-[11px] text-muted-foreground whitespace-nowrap">{h.fecha}</td>
                    <td className="py-3 px-2 text-xs font-bold">{h.orden}</td>
                    <td className="py-3 px-2 text-xs text-muted-foreground">{h.producto}</td>
                    <td className="py-3 px-2 text-xs text-right">×{h.qty}</td>
                    <td className="py-3 px-2 text-xs text-muted-foreground">—</td>{/* priority: no existe en RFC */}
                    <td className="py-3 px-2"><StateBadge s={h.state} /></td>
                    <td className="py-3 px-2 text-xs">{h.rover}</td>
                    <td className="py-3 px-2 text-xs text-right tabular-nums">{h.tiempo}</td>
                    <td className="py-3 px-2 text-xs text-right tabular-nums">{h.queue}</td>
                    <td className="py-3 px-2 text-[11px] text-muted-foreground">{h.motivo}</td>
                  </tr>
                ))}
                {filteredHist.length === 0 && (
                  <tr><td colSpan={10} className="py-6 text-center text-xs text-muted-foreground">Sin registros para el rango seleccionado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="self-start" title="Órdenes por prioridad" action={<PeriodLabelView value={period} range={customRange} />}>
          <div className="flex items-center gap-3">
            <div className="relative w-[140px] h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={prioData} dataKey="value" innerRadius={42} outerRadius={62} paddingAngle={2} stroke="none">
                    {prioData.map((d) => <Cell key={d.key} fill={PRIORITY_COLOR[d.key]} />)}
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
                      <span className="w-2 h-2 rounded-sm" style={{ background: PRIORITY_COLOR[d.key] }} />
                      {d.name}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{d.value} <span className="opacity-60">({pct}%)</span></span>
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

function Panel({ title, subtitle, action, className = "", children }: { title: string; subtitle?: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
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

function KpiCard({ icon: Icon, label, value, sub, tone, positive }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string; tone: string; positive: boolean }) {
  const toneCls: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    success: "text-emerald-500 bg-emerald-500/10",
    warning: "text-warning bg-warning/10",
    info: "text-info bg-info/10",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${toneCls[tone] ?? "text-primary bg-primary/10"}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className={cn("text-[10px] mt-1", positive ? "text-emerald-500" : "text-destructive")}>{sub}</p>
    </div>
  );
}

function StateBadge({ s }: { s: OrderState }) {
  const map: Record<OrderState, string> = {
    in_progress: "border-primary/30 bg-primary/10 text-primary",
    pending:     "border-info/40 bg-info/10 text-info",
    completed:   "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    cancelled:   "border-destructive/30 bg-destructive/10 text-destructive",
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${map[s]}`}>{STATE_LABELS[s]}</span>;
}

function TableTabs({ value, onChange }: { value: "todas" | OrderState; onChange: (v: "todas" | OrderState) => void }) {
  const tabs: Array<{ id: "todas" | OrderState; label: string }> = [
    { id: "todas",       label: "Todas" },
    { id: "in_progress", label: "In progress" },
    { id: "pending",     label: "Pending" },
  ];
  return (
    <div className="flex items-center gap-1 p-0.5 rounded-md border border-border bg-secondary/30">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "px-2.5 py-1 text-[11px] rounded transition-colors",
            value === t.id ? "bg-warning text-warning-foreground font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >{t.label}</button>
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
  value, onChange, range, onRangeChange,
}: {
  value: PeriodId; onChange: (v: PeriodId) => void;
  range?: DateRange; onRangeChange?: (r: DateRange | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded-md border border-border bg-card hover:bg-secondary/40 px-3 py-1.5 text-xs">
          <CalendarIcon className="w-3.5 h-3.5" /> {periodLabel(value, range)} <ChevronDown className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2">
        <div className="flex">
          <div className="w-48 p-1 border-r border-border">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.id}
                onClick={() => { onChange(p.id); if (p.id !== "custom") setOpen(false); }}
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
                >Aplicar ›</button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RangePicker({ range, onRangeChange }: { range?: DateRange; onRangeChange: (r: DateRange | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const label =
    range?.from && range?.to ? `${format(range.from, "dd/MM/yyyy")} – ${format(range.to, "dd/MM/yyyy")}`
    : range?.from ? `Desde ${format(range.from, "dd/MM/yyyy")}`
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
          <button onClick={() => { onRangeChange(undefined); setOpen(false); }} className="text-[11px] text-muted-foreground hover:text-foreground">Limpiar</button>
          <button onClick={() => setOpen(false)} disabled={!range?.from || !range?.to} className="text-[11px] text-primary hover:underline disabled:text-muted-foreground disabled:no-underline">Aplicar ›</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterMenu({
  state, onState,
}: {
  state: Set<OrderState>; onState: (s: Set<OrderState>) => void;
}) {
  const toggleState = (id: OrderState) => {
    const next = new Set(state);
    if (next.has(id)) next.delete(id); else next.add(id);
    onState(next);
  };
  const totalActive = state.size < STATE_FILTERS.length ? STATE_FILTERS.length - state.size : 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-secondary/40 text-xs">
          <Filter className="w-3.5 h-3.5" /> Filtros
          {totalActive > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px]">{totalActive}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">Estado</p>
        {STATE_FILTERS.map((s) => <CheckRow key={s.id} on={state.has(s.id)} label={s.label} onClick={() => toggleState(s.id)} />)}
        <div className="flex justify-between mt-2 pt-2 border-t border-border">
          <button onClick={() => onState(new Set())} className="text-[11px] text-muted-foreground hover:text-foreground px-1">Limpiar</button>
          <button onClick={() => onState(new Set(STATE_FILTERS.map((s) => s.id)))} className="text-[11px] text-primary hover:underline px-1">Todos</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CheckRow({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-secondary/60">
      <span className={`w-3.5 h-3.5 rounded border ${on ? "bg-primary border-primary" : "border-border"} flex items-center justify-center`}>
        {on && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
      </span>
      {label}
    </button>
  );
}
