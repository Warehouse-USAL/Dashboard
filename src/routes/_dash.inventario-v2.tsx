import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  DollarSign,
  AlertTriangle,
  PackageX,
  Clock,
  TrendingDown,
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Check,
  RefreshCw,
  CalendarIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  useInventoryMetrics,
  type InvStatus,
  type EnrichedProduct,
} from "@/hooks/useInventoryMetrics";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dash/inventario-v2")({
  component: InventarioPage,
  head: () => ({ meta: [{ title: "Inventario · SmartWarehouse" }] }),
});

// ─── Types ────────────────────────────────────────────────────────────────────

const INV_STATUS_LABEL: Record<InvStatus, string> = {
  disponible: "Disponible",
  riesgo: "En riesgo",
  quiebre: "Quiebre",
  dead: "Dead stock",
};

const INV_STATUS_CSS: Record<InvStatus, string> = {
  disponible: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  riesgo: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  quiebre: "border-destructive/30 bg-destructive/10 text-destructive",
  dead: "border-border bg-secondary/60 text-muted-foreground",
};

const INV_STATUS_COLOR: Record<InvStatus, string> = {
  disponible: "oklch(0.78 0.18 160)",
  riesgo: "oklch(0.78 0.18 80)",
  quiebre: "oklch(0.65 0.24 27)",
  dead: "oklch(0.65 0.05 250)",
};

type SortKey =
  | "sku"
  | "name"
  | "zone"
  | "reserved"
  | "available"
  | "dailyDemand"
  | "coverageDays"
  | "reqNeto"
  | "stockValue"
  | "lastOrderDaysAgo"
  | "invStatus";

const ZONES = ["A", "B", "C", "D", "E"] as const;
type Zone = (typeof ZONES)[number];

const ZONE_CAPACITY: Record<Zone, number> = { A: 200, B: 200, C: 150, D: 120, E: 150 };

// ─── Mock movimientos data (no endpoint in RFC) ───────────────────────────────

const PERIOD_OPTIONS = [
  { id: "24h", label: "Últimas 24 horas" },
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "90d", label: "Últimos 90 días" },
  { id: "custom", label: "Rango personalizado" },
] as const;
type PeriodId = (typeof PERIOD_OPTIONS)[number]["id"];
type DataPeriodId = Exclude<PeriodId, "custom">;

const MOV_BY_PERIOD: Record<
  DataPeriodId,
  Array<{ h: string; entradas: number; salidas: number }>
> = {
  "24h": ["00", "04", "08", "12", "16", "20"].map((h, i) => ({
    h: `${h}:00`,
    entradas: [12, 8, 42, 68, 54, 22][i],
    salidas: [18, 14, 56, 82, 72, 38][i],
  })),
  "7d": ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d, i) => ({
    h: d,
    entradas: [240, 280, 310, 260, 340, 180, 120][i],
    salidas: [320, 360, 380, 340, 420, 210, 140][i],
  })),
  "30d": Array.from({ length: 6 }, (_, i) => ({
    h: `Sem ${i + 1}`,
    entradas: [1240, 1380, 1420, 1310, 1480, 1360][i],
    salidas: [1480, 1620, 1680, 1540, 1740, 1580][i],
  })),
  "90d": ["Mar", "Abr", "May"].map((m, i) => ({
    h: m,
    entradas: [5240, 5680, 5920][i],
    salidas: [6120, 6380, 6720][i],
  })),
};

type MovKind = "entrada" | "salida" | "ajuste";
type MovRow = {
  offsetH: number;
  sku: string;
  kind: MovKind;
  qty: number;
  rover: string;
  nota: string;
};
const MOVIMIENTOS: MovRow[] = [
  { offsetH: 1, sku: "SKU-A102", kind: "salida", qty: 3, rover: "R-01", nota: "OR-12511" },
  { offsetH: 2, sku: "SKU-C019", kind: "salida", qty: 5, rover: "R-03", nota: "OR-12510" },
  { offsetH: 4, sku: "SKU-B441", kind: "entrada", qty: 12, rover: "—", nota: "Recepción prov." },
  { offsetH: 6, sku: "SKU-D227", kind: "salida", qty: 2, rover: "R-04", nota: "OR-12508" },
  { offsetH: 9, sku: "SKU-B502", kind: "ajuste", qty: -2, rover: "—", nota: "Inventario cíclico" },
  { offsetH: 14, sku: "SKU-A188", kind: "salida", qty: 6, rover: "R-02", nota: "OR-12507" },
  { offsetH: 22, sku: "SKU-E412", kind: "entrada", qty: 10, rover: "—", nota: "Recepción prov." },
  { offsetH: 30, sku: "SKU-C077", kind: "salida", qty: 4, rover: "R-01", nota: "OR-12498" },
  { offsetH: 48, sku: "SKU-D310", kind: "salida", qty: 8, rover: "R-04", nota: "OR-12492" },
  { offsetH: 120, sku: "SKU-A102", kind: "entrada", qty: 60, rover: "—", nota: "Recepción prov." },
  { offsetH: 480, sku: "SKU-C019", kind: "entrada", qty: 30, rover: "—", nota: "Recepción prov." },
  { offsetH: 720, sku: "SKU-D227", kind: "salida", qty: 5, rover: "R-02", nota: "OR-12300" },
];

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtMoney(ars: number): string {
  if (ars >= 1_000_000) return `$${(ars / 1_000_000).toFixed(1)}M`;
  if (ars >= 1_000) return `$${(ars / 1_000).toFixed(0)}K`;
  return `$${Math.round(ars).toLocaleString("es-AR")}`;
}

function fmtCoverage(days: number): string {
  if (days >= 9999) return "∞";
  if (days === 0) return "0d";
  if (days < 1) return "<1d";
  return `${Math.round(days)}d`;
}

function fmtDemand(d: number): string {
  if (d < 0.01) return "—";
  if (d < 1) return d.toFixed(1);
  return `${Math.round(d)}`;
}

function fmtLastOrder(date: string | null, daysAgo: number | null): string {
  if (!date) return "—";
  if (daysAgo === null) return "—";
  if (daysAgo < 1) return "Hoy";
  if (daysAgo < 2) return "Ayer";
  if (daysAgo < 7) return `Hace ${Math.round(daysAgo)}d`;
  return format(new Date(date), "dd/MM/yy");
}

function periodLabel(value: PeriodId, range?: DateRange): string {
  if (value === "custom") {
    if (range?.from && range?.to)
      return `${format(range.from, "dd/MM/yy")} – ${format(range.to, "dd/MM/yy")}`;
    if (range?.from) return `Desde ${format(range.from, "dd/MM/yy")}`;
    return "Rango personalizado";
  }
  return PERIOD_OPTIONS.find((p) => p.id === value)!.label;
}

// ─── Main component ───────────────────────────────────────────────────────────

function InventarioPage() {
  const { products, kpis } = useInventoryMetrics();

  const [zoneFilter, setZoneFilter] = useState<Set<Zone>>(new Set(ZONES));
  const [statusFilter, setStatusFilter] = useState<Set<InvStatus>>(
    new Set(["disponible", "riesgo", "quiebre", "dead"] as InvStatus[]),
  );
  const [tableTab, setTableTab] = useState<"todos" | InvStatus>("todos");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sku");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [period, setPeriod] = useState<PeriodId>("7d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  const dataPeriod: DataPeriodId = useMemo(() => {
    if (period !== "custom") return period;
    if (!customRange?.from || !customRange?.to) return "30d";
    const days = Math.ceil((customRange.to.getTime() - customRange.from.getTime()) / 86_400_000);
    if (days <= 1) return "24h";
    if (days <= 7) return "7d";
    if (days <= 30) return "30d";
    return "90d";
  }, [period, customRange]);

  // Distribution donut — 4-way status from real data
  const distByStatus = useMemo(() => {
    const acc: Record<InvStatus, number> = { disponible: 0, riesgo: 0, quiebre: 0, dead: 0 };
    products.forEach((p) => {
      acc[p.invStatus] += 1;
    });
    return acc;
  }, [products]);
  const distTotal = Object.values(distByStatus).reduce((a, b) => a + b, 0);
  const distData = (Object.keys(distByStatus) as InvStatus[]).map((k) => ({
    key: k,
    name: INV_STATUS_LABEL[k],
    value: distByStatus[k],
  }));

  // Zone occupancy — real available stock grouped by zone, mock capacity
  const occupancy = useMemo(() => {
    const byZone = new Map<Zone, number>();
    products.forEach((p) => {
      const z = p.zone.split("-")[0] as Zone;
      if ((ZONES as readonly string[]).includes(z))
        byZone.set(z, (byZone.get(z) ?? 0) + p.available);
    });
    return ZONES.filter((z) => zoneFilter.has(z)).map((z) => {
      const used = byZone.get(z) ?? 0;
      const cap = ZONE_CAPACITY[z];
      const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
      const tone = pct >= 85 ? "bg-rose-500" : pct >= 65 ? "bg-amber-500" : "bg-emerald-500";
      return { zone: z, used, cap, pct, tone };
    });
  }, [products, zoneFilter]);

  // Top 5 by daily demand (rotation)
  const topRotacion = useMemo(
    () => [...products].sort((a, b) => b.dailyDemand - a.dailyDemand).slice(0, 5),
    [products],
  );

  // Filtered + sorted table
  const filteredTable = useMemo(() => {
    let list = products.filter((p) => {
      if (tableTab !== "todos" && p.invStatus !== tableTab) return false;
      if (!statusFilter.has(p.invStatus)) return false;
      const z = p.zone.split("-")[0] as Zone;
      if ((ZONES as readonly string[]).includes(z) && !zoneFilter.has(z)) return false;
      if (q && !`${p.sku} ${p.name} ${p.zone}`.toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "sku":
          cmp = a.sku.localeCompare(b.sku);
          break;
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "zone":
          cmp = a.zone.localeCompare(b.zone);
          break;
        case "reserved":
          cmp = a.reserved - b.reserved;
          break;
        case "available":
          cmp = a.available - b.available;
          break;
        case "dailyDemand":
          cmp = a.dailyDemand - b.dailyDemand;
          break;
        case "coverageDays":
          cmp = a.coverageDays - b.coverageDays;
          break;
        case "reqNeto":
          cmp = a.reqNeto - b.reqNeto;
          break;
        case "stockValue":
          cmp = a.stockValue - b.stockValue;
          break;
        case "lastOrderDaysAgo":
          cmp = (a.lastOrderDaysAgo ?? 9999) - (b.lastOrderDaysAgo ?? 9999);
          break;
        case "invStatus":
          cmp = a.invStatus.localeCompare(b.invStatus);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [products, tableTab, statusFilter, zoneFilter, q, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Movimientos (mock)
  const movimientos = useMemo(() => {
    const now = Date.now();
    let from: number | undefined;
    let to: number | undefined;
    if (period === "custom") {
      from = customRange?.from?.getTime();
      to = customRange?.to ? customRange.to.getTime() + 86_400_000 : undefined;
    } else {
      const days = period === "24h" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : 90;
      from = now - days * 86_400_000;
      to = now;
    }
    return MOVIMIENTOS.map((m) => ({ ...m, t: now - m.offsetH * 3_600_000 }))
      .filter((m) => {
        if (from !== undefined && m.t < from) return false;
        if (to !== undefined && m.t > to) return false;
        return true;
      })
      .map((m) => ({ ...m, fecha: format(new Date(m.t), "dd/MM/yyyy HH:mm") }));
  }, [period, customRange]);

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Inventario</h1>
          <p className="text-xs text-muted-foreground">
            Estado actual del stock · actualización cada 10s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border bg-card hover:bg-secondary/40">
            <Download className="w-3.5 h-3.5" /> Exportar
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border bg-card hover:bg-secondary/40">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>
      </div>

      {/* ── 5 KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={DollarSign}
          label="Valor del inventario"
          value={fmtMoney(kpis.totalValue)}
          sub="stock disponible × precio"
          tone="primary"
        />
        <KpiCard
          icon={AlertTriangle}
          label="SKUs en riesgo"
          value={kpis.skusAtRisk.toString()}
          sub="cobertura < 5 días"
          tone="warning"
        />
        <KpiCard
          icon={PackageX}
          label="En quiebre"
          value={kpis.skusBreached.toString()}
          sub="stock disponible = 0"
          tone="danger"
        />
        <KpiCard
          icon={Clock}
          label="Cobertura promedio"
          value={`${kpis.avgCoverage.toFixed(1)}d`}
          sub="días de stock restante"
          tone="info"
        />
        <KpiCard
          icon={TrendingDown}
          label="Dead stock (valor)"
          value={fmtMoney(kpis.deadStockValue)}
          sub="sin órdenes en 7 días"
          tone="muted"
        />
      </div>

      {/* ── Product table ── */}
      <Panel
        title="Catálogo de productos"
        subtitle={`${filteredTable.length} producto${filteredTable.length === 1 ? "" : "s"}`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <TableTabs value={tableTab} onChange={setTableTab} />
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar SKU..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-secondary/40 focus:outline-none focus:border-primary w-36"
              />
            </div>
            <FilterMenu
              zone={zoneFilter}
              onZone={setZoneFilter}
              status={statusFilter}
              onStatus={setStatusFilter}
            />
          </div>
        }
      >
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <SortTh k="sku" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  SKU
                </SortTh>
                <SortTh k="name" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  Producto
                </SortTh>
                <SortTh k="zone" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  Posición
                </SortTh>
                <SortTh k="reserved" active={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Reservado
                </SortTh>
                <SortTh k="available" active={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Disponible
                </SortTh>
                <SortTh k="dailyDemand" active={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Dem. diaria
                </SortTh>
                <SortTh k="coverageDays" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  Cobertura
                </SortTh>
                <SortTh k="reqNeto" active={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Req. neto
                </SortTh>
                <SortTh k="stockValue" active={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Valor stock
                </SortTh>
                <SortTh k="lastOrderDaysAgo" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  Última orden
                </SortTh>
                <SortTh k="invStatus" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  Estado
                </SortTh>
              </tr>
            </thead>
            <tbody>
              {filteredTable.map((p) => (
                <ProductRow key={p.sku} p={p} />
              ))}
              {filteredTable.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-10 text-xs text-muted-foreground">
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── Row 2: Distribution + Occupancy + Top Rotación ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Donut — 4-way status */}
        <Panel title="Distribución por estado">
          <div className="flex items-center gap-3">
            <div className="relative w-[140px] h-[140px] shrink-0">
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
                      <Cell key={d.key} fill={INV_STATUS_COLOR[d.key]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-bold">{distTotal}</span>
                <span className="text-[10px] text-muted-foreground">SKUs</span>
              </div>
            </div>
            <div className="flex-1 text-[11px] space-y-1.5">
              {distData.map((d) => {
                const pct = distTotal ? Math.round((d.value / distTotal) * 100) : 0;
                return (
                  <div key={d.key} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={{ background: INV_STATUS_COLOR[d.key] }}
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

        {/* Zone occupancy */}
        <Panel title="Ocupación por zona" subtitle="Stock disponible / capacidad">
          <div className="space-y-2.5">
            {occupancy.map((o) => (
              <div key={o.zone} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium">Zona {o.zone}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {o.used}/{o.cap} <span className="opacity-60">({o.pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                  <div className={`h-full ${o.tone}`} style={{ width: `${o.pct}%` }} />
                </div>
              </div>
            ))}
            {occupancy.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-6">
                Sin zonas seleccionadas
              </p>
            )}
          </div>
        </Panel>

        {/* Top rotación */}
        <Panel title="Top rotación" subtitle="Mayor demanda diaria (30d)">
          <div className="space-y-2">
            {topRotacion.map((p, i) => {
              const max = topRotacion[0]?.dailyDemand || 1;
              const pct = max > 0 ? Math.round((p.dailyDemand / max) * 100) : 0;
              return (
                <div key={p.sku} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground w-3 tabular-nums">{i + 1}</span>
                      <span className="font-mono font-semibold">{p.sku}</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {fmtDemand(p.dailyDemand)} u/d
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-secondary/60 overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {topRotacion.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-6">Sin datos</p>
            )}
          </div>
        </Panel>
      </div>

      {/* ── Movimientos chart (mock) ── */}
      <Panel
        title="Movimientos de stock"
        subtitle="Entradas vs salidas · datos sintéticos"
        action={
          <PeriodPicker
            value={period}
            onChange={setPeriod}
            range={customRange}
            onRangeChange={setCustomRange}
          />
        }
      >
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={MOV_BY_PERIOD[dataPeriod]}
              margin={{ top: 6, right: 8, bottom: 0, left: -16 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 250)" />
              <XAxis dataKey="h" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Bar dataKey="entradas" fill="oklch(0.78 0.18 180)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="salidas" fill="oklch(0.72 0.18 50)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 text-[11px] mt-2">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: "oklch(0.78 0.18 180)" }} />
            Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: "oklch(0.72 0.18 50)" }} />
            Salidas
          </span>
        </div>
      </Panel>

      {/* ── Movimientos recientes (mock) ── */}
      <Panel
        title="Movimientos recientes"
        subtitle={`${movimientos.length} movimiento${movimientos.length === 1 ? "" : "s"} · datos sintéticos`}
        action={
          <button className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-secondary/40">
            <Download className="w-3 h-3" /> Exportar
          </button>
        }
      >
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <Th>Fecha</Th>
                <Th>SKU</Th>
                <Th>Tipo</Th>
                <Th className="text-right">Cantidad</Th>
                <Th>Rover</Th>
                <Th>Nota</Th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m, i) => (
                <tr
                  key={`${m.sku}-${i}`}
                  className="border-b border-border/50 hover:bg-secondary/30"
                >
                  <td className="py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap">
                    {m.fecha}
                  </td>
                  <td className="py-2.5 px-2 text-xs font-mono font-bold">{m.sku}</td>
                  <td className="py-2.5 px-2">
                    <MovBadge k={m.kind} />
                  </td>
                  <td
                    className={cn(
                      "py-2.5 px-2 text-xs text-right tabular-nums font-semibold",
                      m.qty < 0
                        ? "text-destructive"
                        : m.kind === "entrada"
                          ? "text-emerald-500"
                          : "text-foreground",
                    )}
                  >
                    {m.qty > 0 ? `+${m.qty}` : m.qty}
                  </td>
                  <td className="py-2.5 px-2 text-xs">{m.rover}</td>
                  <td className="py-2.5 px-2 text-xs text-muted-foreground">{m.nota}</td>
                </tr>
              ))}
              {movimientos.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                    Sin movimientos en el período
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ─── ProductRow ───────────────────────────────────────────────────────────────

function ProductRow({ p }: { p: EnrichedProduct }) {
  const coverPct = p.coverageDays >= 9999 ? 100 : Math.min(100, (p.coverageDays / 30) * 100);
  const coverTone =
    p.coverageDays >= 9999
      ? "bg-muted-foreground/40"
      : p.coverageDays < 5
        ? "bg-destructive"
        : p.coverageDays < 15
          ? "bg-amber-500"
          : "bg-emerald-500";

  return (
    <tr className="border-b border-border/50 hover:bg-secondary/30">
      <td className="py-3 px-2 text-xs font-mono font-bold">{p.sku}</td>
      <td className="py-3 px-2 text-xs max-w-[160px] truncate" title={p.name}>
        {p.name}
      </td>
      <td className="py-3 px-2 text-xs text-muted-foreground">{p.zone}</td>
      <td className="py-3 px-2 text-xs text-right tabular-nums text-muted-foreground">
        {p.reserved}
      </td>
      <td className="py-3 px-2 text-xs text-right tabular-nums font-semibold">{p.available}</td>
      <td className="py-3 px-2 text-xs text-right tabular-nums text-muted-foreground">
        {fmtDemand(p.dailyDemand)}
      </td>
      <td className="py-3 px-2">
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
            <div className={`h-full ${coverTone}`} style={{ width: `${coverPct}%` }} />
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
            {fmtCoverage(p.coverageDays)}
          </span>
        </div>
      </td>
      <td className="py-3 px-2 text-xs text-right tabular-nums text-muted-foreground">
        {p.reqNeto > 0 ? `${p.reqNeto} u` : "—"}
      </td>
      <td className="py-3 px-2 text-xs text-right tabular-nums">
        {p.priceCents > 0 ? fmtMoney(p.stockValue) : "—"}
      </td>
      <td className="py-3 px-2 text-xs text-muted-foreground whitespace-nowrap">
        {fmtLastOrder(p.lastOrderDate, p.lastOrderDaysAgo)}
      </td>
      <td className="py-3 px-2">
        <InvStatusBadge s={p.invStatus} />
      </td>
    </tr>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
        {action && <div className="flex items-center">{action}</div>}
      </div>
      {children}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium py-2 px-2 ${className}`}>{children}</th>;
}

function SortTh({
  k,
  active,
  dir,
  onSort,
  right,
  children,
}: {
  k: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  right?: boolean;
  children: React.ReactNode;
}) {
  const isActive = active === k;
  const Icon = isActive ? (dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      className={cn(
        "font-medium py-2 px-2 cursor-pointer select-none whitespace-nowrap",
        "hover:text-foreground transition-colors",
        right ? "text-right" : "text-left",
      )}
      onClick={() => onSort(k)}
    >
      <span className="inline-flex items-center gap-1">
        {right && <Icon className={cn("w-3 h-3", isActive ? "text-primary" : "opacity-40")} />}
        {children}
        {!right && <Icon className={cn("w-3 h-3", isActive ? "text-primary" : "opacity-40")} />}
      </span>
    </th>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  tone: "primary" | "warning" | "danger" | "info" | "muted";
}) {
  const toneCls: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    warning: "text-amber-500 bg-amber-500/10",
    danger: "text-destructive bg-destructive/10",
    info: "text-sky-500 bg-sky-500/10",
    muted: "text-muted-foreground bg-secondary/60",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${toneCls[tone]}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">
          {label}
        </p>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function InvStatusBadge({ s }: { s: InvStatus }) {
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${INV_STATUS_CSS[s]}`}
    >
      {INV_STATUS_LABEL[s]}
    </span>
  );
}

function MovBadge({ k }: { k: MovKind }) {
  const map: Record<MovKind, string> = {
    entrada: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    salida: "border-primary/30 bg-primary/10 text-primary",
    ajuste: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  };
  const label: Record<MovKind, string> = { entrada: "Entrada", salida: "Salida", ajuste: "Ajuste" };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${map[k]}`}>
      {label[k]}
    </span>
  );
}

function TableTabs({
  value,
  onChange,
}: {
  value: "todos" | InvStatus;
  onChange: (v: "todos" | InvStatus) => void;
}) {
  const tabs: Array<{ id: "todos" | InvStatus; label: string }> = [
    { id: "todos", label: "Todos" },
    { id: "disponible", label: "Disponible" },
    { id: "riesgo", label: "En riesgo" },
    { id: "quiebre", label: "Quiebre" },
    { id: "dead", label: "Dead stock" },
  ];
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-border bg-secondary/30">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "px-2 py-1 text-[11px] rounded transition-colors",
            value === t.id
              ? "bg-card text-foreground font-medium shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function FilterMenu({
  zone,
  onZone,
  status,
  onStatus,
}: {
  zone: Set<Zone>;
  onZone: (s: Set<Zone>) => void;
  status: Set<InvStatus>;
  onStatus: (s: Set<InvStatus>) => void;
}) {
  const INV_STATUS_LIST: InvStatus[] = ["disponible", "riesgo", "quiebre", "dead"];
  const toggleZone = (z: Zone) => {
    const next = new Set(zone);
    if (next.has(z)) next.delete(z);
    else next.add(z);
    onZone(next);
  };
  const toggleStatus = (s: InvStatus) => {
    const next = new Set(status);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onStatus(next);
  };
  const active =
    (zone.size < ZONES.length ? ZONES.length - zone.size : 0) +
    (status.size < INV_STATUS_LIST.length ? INV_STATUS_LIST.length - status.size : 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card hover:bg-secondary/40 text-xs">
          <Filter className="w-3.5 h-3.5" /> Filtros
          {active > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px]">
              {active}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">
          Estado
        </p>
        {INV_STATUS_LIST.map((s) => (
          <CheckRow
            key={s}
            on={status.has(s)}
            label={INV_STATUS_LABEL[s]}
            onClick={() => toggleStatus(s)}
          />
        ))}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mt-3 mb-1">
          Zona
        </p>
        {ZONES.map((z) => (
          <CheckRow key={z} on={zone.has(z)} label={`Zona ${z}`} onClick={() => toggleZone(z)} />
        ))}
        <div className="flex justify-between mt-2 pt-2 border-t border-border">
          <button
            onClick={() => {
              onStatus(new Set());
              onZone(new Set());
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground px-1"
          >
            Limpiar
          </button>
          <button
            onClick={() => {
              onStatus(new Set(INV_STATUS_LIST));
              onZone(new Set(ZONES));
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
        className={cn(
          "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
          on ? "bg-primary border-primary" : "border-border",
        )}
      >
        {on && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
      </span>
      {label}
    </button>
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
          <CalendarIcon className="w-3.5 h-3.5" />
          {periodLabel(value, range)}
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
