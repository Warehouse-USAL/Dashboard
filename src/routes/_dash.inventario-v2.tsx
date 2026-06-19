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
  PackageSearch,
  Boxes,
  AlertTriangle,
  TrendingDown,
  Layers,
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
import { useProducts } from "@/hooks/useProducts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dash/inventario-v2")({
  component: InventarioPage,
  head: () => ({ meta: [{ title: "Inventario · SmartWarehouse" }] }),
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

type StockStatus = "ok" | "bajo" | "agotado";
const STATUS_LABELS: Record<StockStatus, string> = {
  ok: "Disponible",
  bajo: "Stock bajo",
  agotado: "Agotado",
};
const STATUS_FILTERS: { id: StockStatus; label: string }[] = (
  Object.keys(STATUS_LABELS) as StockStatus[]
).map((id) => ({ id, label: STATUS_LABELS[id] }));

const ZONES = ["A", "B", "C", "D", "E"] as const;
type Zone = (typeof ZONES)[number];

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
    skus: number;
    unidades: number;
    rotacion: number;
    rotDelta: number;
    cobertura: number;
    covDelta: number;
    quiebres: number;
    quiebresDelta: number;
  }
> = {
  "24h": {
    skus: 248,
    unidades: 12480,
    rotacion: 1.2,
    rotDelta: 0.1,
    cobertura: 9.4,
    covDelta: -0.2,
    quiebres: 1,
    quiebresDelta: 0,
  },
  "7d": {
    skus: 248,
    unidades: 12340,
    rotacion: 1.4,
    rotDelta: 0.2,
    cobertura: 8.9,
    covDelta: -0.5,
    quiebres: 3,
    quiebresDelta: 1,
  },
  "30d": {
    skus: 252,
    unidades: 11980,
    rotacion: 1.6,
    rotDelta: 0.3,
    cobertura: 8.1,
    covDelta: -1.1,
    quiebres: 8,
    quiebresDelta: 2,
  },
  "90d": {
    skus: 261,
    unidades: 11420,
    rotacion: 1.5,
    rotDelta: -0.1,
    cobertura: 7.6,
    covDelta: -1.8,
    quiebres: 21,
    quiebresDelta: 4,
  },
};

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

const ZONE_OCCUPANCY: Record<Zone, { used: number; cap: number }> = {
  A: { used: 142, cap: 200 },
  B: { used: 168, cap: 200 },
  C: { used: 89, cap: 150 },
  D: { used: 56, cap: 120 },
  E: { used: 110, cap: 150 },
};

// --- Catálogo extendido (mock) ---
type Product = {
  sku: string;
  name: string;
  zone: string;
  available: number;
  reserved: number;
  minimum: number;
  status: StockStatus;
  rotation: number; // unidades/día prom
  lastMove: number; // horas atrás
};

const CATALOG: Product[] = [
  {
    sku: "SKU-A102",
    name: "Caja estándar 24u",
    zone: "A-3",
    available: 142,
    reserved: 18,
    minimum: 40,
    status: "ok",
    rotation: 32,
    lastMove: 2,
  },
  {
    sku: "SKU-A188",
    name: "Caja estándar 12u",
    zone: "A-5",
    available: 88,
    reserved: 12,
    minimum: 30,
    status: "ok",
    rotation: 24,
    lastMove: 5,
  },
  {
    sku: "SKU-B441",
    name: "Pallet industrial",
    zone: "B-1",
    available: 28,
    reserved: 4,
    minimum: 10,
    status: "ok",
    rotation: 6,
    lastMove: 9,
  },
  {
    sku: "SKU-B502",
    name: "Pallet reforzado",
    zone: "B-4",
    available: 12,
    reserved: 2,
    minimum: 8,
    status: "bajo",
    rotation: 4,
    lastMove: 18,
  },
  {
    sku: "SKU-C019",
    name: "Caja 12u liviana",
    zone: "C-2",
    available: 9,
    reserved: 6,
    minimum: 25,
    status: "bajo",
    rotation: 18,
    lastMove: 1,
  },
  {
    sku: "SKU-C077",
    name: "Caja 6u premium",
    zone: "C-3",
    available: 64,
    reserved: 8,
    minimum: 20,
    status: "ok",
    rotation: 14,
    lastMove: 6,
  },
  {
    sku: "SKU-D227",
    name: "Bulto reforzado",
    zone: "D-4",
    available: 56,
    reserved: 4,
    minimum: 15,
    status: "ok",
    rotation: 9,
    lastMove: 3,
  },
  {
    sku: "SKU-D310",
    name: "Bulto liviano",
    zone: "D-2",
    available: 0,
    reserved: 0,
    minimum: 12,
    status: "agotado",
    rotation: 5,
    lastMove: 48,
  },
  {
    sku: "SKU-E308",
    name: "Pallet refrigerado",
    zone: "E-1",
    available: 0,
    reserved: 0,
    minimum: 6,
    status: "agotado",
    rotation: 3,
    lastMove: 72,
  },
  {
    sku: "SKU-E412",
    name: "Pallet refrigerado XL",
    zone: "E-3",
    available: 22,
    reserved: 6,
    minimum: 8,
    status: "ok",
    rotation: 5,
    lastMove: 11,
  },
];

// movimientos sintéticos
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
  { offsetH: 72, sku: "SKU-E308", kind: "salida", qty: 1, rover: "R-05", nota: "OR-12485" },
  { offsetH: 120, sku: "SKU-A102", kind: "entrada", qty: 60, rover: "—", nota: "Recepción prov." },
  { offsetH: 240, sku: "SKU-B441", kind: "ajuste", qty: 3, rover: "—", nota: "Inventario cíclico" },
  { offsetH: 480, sku: "SKU-C019", kind: "entrada", qty: 30, rover: "—", nota: "Recepción prov." },
  { offsetH: 720, sku: "SKU-D227", kind: "salida", qty: 5, rover: "R-02", nota: "OR-12300" },
  { offsetH: 1440, sku: "SKU-E308", kind: "ajuste", qty: -3, rover: "—", nota: "Merma" },
];

const COLORS = {
  teal: "oklch(0.78 0.18 180)",
  amber: "oklch(0.78 0.18 80)",
  orange: "oklch(0.72 0.18 50)",
  red: "oklch(0.65 0.24 27)",
  blue: "oklch(0.65 0.15 250)",
  muted: "oklch(0.65 0.05 250)",
} as const;
const STATUS_COLOR: Record<StockStatus, string> = {
  ok: COLORS.teal,
  bajo: COLORS.amber,
  agotado: COLORS.red,
};

function InventarioPage() {
  const { data: productsApi } = useProducts();

  // Combinamos los del backend/hook con extras del catálogo para tener datos más ricos
  const products: Product[] = useMemo(() => {
    const map = new Map<string, Product>();
    CATALOG.forEach((p) => map.set(p.sku, p));
    productsApi.forEach((p) => {
      const ext = map.get(p.sku);
      if (ext) {
        map.set(p.sku, {
          ...ext,
          name: p.name || ext.name,
          zone: p.zone || ext.zone,
          available: p.available,
          status: (p.status as StockStatus) ?? ext.status,
        });
      } else {
        map.set(p.sku, {
          sku: p.sku,
          name: p.name,
          zone: p.zone,
          available: p.available,
          reserved: 0,
          minimum: Math.max(5, Math.round(p.available * 0.1)),
          status: (p.status as StockStatus) ?? "ok",
          rotation: 6,
          lastMove: 12,
        });
      }
    });
    return Array.from(map.values());
  }, [productsApi]);

  const [period, setPeriod] = useState<PeriodId>("7d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [statusFilter, setStatusFilter] = useState<Set<StockStatus>>(
    new Set(STATUS_FILTERS.map((s) => s.id)),
  );
  const [zoneFilter, setZoneFilter] = useState<Set<Zone>>(new Set(ZONES));
  const [tableTab, setTableTab] = useState<"todos" | StockStatus>("todos");
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

  const kpis = KPIS_BY_PERIOD[dataPeriod];
  const movimientosSerie = MOV_BY_PERIOD[dataPeriod];

  // distribución por estado (pie)
  const distribucion: Record<StockStatus, number> = useMemo(() => {
    const acc: Record<StockStatus, number> = { ok: 0, bajo: 0, agotado: 0 };
    products.forEach((p) => {
      acc[p.status] += 1;
    });
    return acc;
  }, [products]);
  const distTotal = (Object.values(distribucion) as number[]).reduce((a, b) => a + b, 0);
  const distData = (Object.keys(distribucion) as StockStatus[]).map((k) => ({
    name: STATUS_LABELS[k],
    key: k,
    value: distribucion[k],
  }));

  // ocupación por zona (filtrada)
  const occupancy = useMemo(() => {
    return ZONES.filter((z) => zoneFilter.has(z)).map((z) => {
      const o = ZONE_OCCUPANCY[z];
      const pct = Math.round((o.used / o.cap) * 100);
      const tone = pct >= 85 ? "bg-rose-500" : pct >= 65 ? "bg-amber-500" : "bg-emerald-500";
      return { zone: z, ...o, pct, tone };
    });
  }, [zoneFilter]);

  // top rotación
  const topRotacion = useMemo(
    () => [...products].sort((a, b) => b.rotation - a.rotation).slice(0, 5),
    [products],
  );

  // tabla filtrada
  const filteredTable = useMemo(
    () =>
      products.filter((p) => {
        if (tableTab !== "todos" && p.status !== tableTab) return false;
        if (!statusFilter.has(p.status)) return false;
        const z = (p.zone.split("-")[0] || "") as Zone;
        if (!zoneFilter.has(z)) return false;
        if (q && !`${p.sku} ${p.name} ${p.zone}`.toLowerCase().includes(q.toLowerCase()))
          return false;
        return true;
      }),
    [products, tableTab, statusFilter, zoneFilter, q],
  );

  // histórico de movimientos filtrado por período + filtros
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

  const filteredMov = useMemo(() => {
    const now = Date.now();
    return MOVIMIENTOS.map((m) => ({ ...m, t: now - m.offsetH * 3_600_000 }))
      .filter((m) => {
        if (histBounds.from !== undefined && m.t < histBounds.from) return false;
        if (histBounds.to !== undefined && m.t > histBounds.to) return false;
        return true;
      })
      .map((m) => ({ ...m, fecha: format(new Date(m.t), "dd/MM/yyyy HH:mm") }));
  }, [histBounds]);

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
          status={statusFilter}
          onStatus={setStatusFilter}
          zone={zoneFilter}
          onZone={setZoneFilter}
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Boxes}
          label="SKUs activos"
          value={kpis.skus.toString()}
          sub={`${kpis.unidades.toLocaleString("es-AR")} unidades`}
          tone="primary"
          positive
        />
        <KpiCard
          icon={TrendingDown}
          label="Rotación prom."
          value={`${kpis.rotacion}×`}
          sub={`${kpis.rotDelta >= 0 ? "+" : ""}${kpis.rotDelta} vs período ant.`}
          tone="info"
          positive={kpis.rotDelta >= 0}
        />
        <KpiCard
          icon={Layers}
          label="Cobertura"
          value={`${kpis.cobertura} días`}
          sub={`${kpis.covDelta >= 0 ? "+" : ""}${kpis.covDelta}d vs período ant.`}
          tone="warning"
          positive={kpis.covDelta >= 0}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Quiebres"
          value={kpis.quiebres.toString()}
          sub={`${kpis.quiebresDelta >= 0 ? "+" : ""}${kpis.quiebresDelta} vs período ant.`}
          tone="success"
          positive={kpis.quiebresDelta <= 0}
        />
      </div>

      {/* Fila 2 — distribución + ocupación + top rotación */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel
          title="Distribución por estado"
          action={<PeriodLabelView value={period} range={customRange} />}
        >
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
                      <Cell key={d.key} fill={STATUS_COLOR[d.key]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
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
                        className="w-2 h-2 rounded-sm"
                        style={{ background: STATUS_COLOR[d.key] }}
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

        <Panel title="Ocupación por zona" subtitle="Capacidad utilizada">
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

        <Panel title="Top rotación" subtitle="Unidades / día prom.">
          <div className="space-y-2">
            {topRotacion.map((p, i) => {
              const max = topRotacion[0]?.rotation || 1;
              const pct = Math.round((p.rotation / max) * 100);
              return (
                <div key={p.sku} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground w-3 tabular-nums">{i + 1}</span>
                      <span className="font-mono font-semibold">{p.sku}</span>
                    </span>
                    <span className="text-muted-foreground tabular-nums">{p.rotation} u/d</span>
                  </div>
                  <div className="h-1 rounded-full bg-secondary/60 overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* Movimientos por período */}
      <Panel
        title="Movimientos de stock"
        subtitle="Entradas vs salidas"
        action={<PeriodLabelView value={period} range={customRange} />}
      >
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={movimientosSerie} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 250)" />
              <XAxis dataKey="h" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Bar dataKey="entradas" fill={COLORS.teal} radius={[4, 4, 0, 0]} />
              <Bar dataKey="salidas" fill={COLORS.orange} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 text-[11px] mt-2">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: COLORS.teal }} />
            Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm" style={{ background: COLORS.orange }} />
            Salidas
          </span>
        </div>
      </Panel>

      {/* Catálogo */}
      <Panel
        title="Catálogo"
        subtitle={`${filteredTable.length} producto${filteredTable.length === 1 ? "" : "s"}`}
        action={
          <div className="flex items-center gap-2">
            <TableTabs value={tableTab} onChange={setTableTab} />
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar SKU..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-secondary/40 focus:outline-none focus:border-primary w-40"
              />
            </div>
          </div>
        }
      >
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <Th>SKU</Th>
                <Th>Producto</Th>
                <Th>Zona</Th>
                <Th className="text-right">Disp.</Th>
                <Th className="text-right">Reserv.</Th>
                <Th className="text-right">Mín.</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {filteredTable.map((p) => {
                const isOpen = expanded.has(p.sku);
                const cobertura =
                  p.rotation > 0 ? Math.round((p.available / p.rotation) * 10) / 10 : 0;
                return (
                  <Fragment key={p.sku}>
                    <tr
                      className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer"
                      onClick={() => toggleExpanded(p.sku)}
                    >
                      <td className="py-3 px-2 text-xs font-mono font-bold">
                        <span className="inline-flex items-center gap-1.5">
                          {isOpen ? (
                            <ChevronDown className="w-3 h-3 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-muted-foreground" />
                          )}
                          {p.sku}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-xs">{p.name}</td>
                      <td className="py-3 px-2 text-xs text-muted-foreground">{p.zone}</td>
                      <td className="py-3 px-2 text-xs text-right font-semibold tabular-nums">
                        {p.available}
                      </td>
                      <td className="py-3 px-2 text-xs text-right text-muted-foreground tabular-nums">
                        {p.reserved}
                      </td>
                      <td className="py-3 px-2 text-xs text-right text-muted-foreground tabular-nums">
                        {p.minimum}
                      </td>
                      <td className="py-3 px-2">
                        <StatusBadge s={p.status} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-secondary/20 border-b border-border/50">
                        <td colSpan={7} className="px-6 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px]">
                            <Detail label="Rotación" value={`${p.rotation} u/día`} />
                            <Detail label="Cobertura" value={`${cobertura} días`} />
                            <Detail label="Último movimiento" value={`hace ${p.lastMove} h`} />
                            <Detail
                              label="Disponible neto"
                              value={`${Math.max(0, p.available - p.reserved)} u`}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {filteredTable.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Movimientos recientes */}
      <Panel
        title="Movimientos recientes"
        subtitle={`${filteredMov.length} movimiento${filteredMov.length === 1 ? "" : "s"}`}
        action={
          <div className="flex items-center gap-2">
            <PeriodLabelView value={period} range={customRange} />
            <button className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-secondary/40">
              <Download className="w-3 h-3" /> Exportar
            </button>
          </div>
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
              {filteredMov.map((m, i) => (
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
              {filteredMov.length === 0 && (
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold mt-0.5">{value}</p>
    </div>
  );
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

function StatusBadge({ s }: { s: StockStatus }) {
  const map: Record<StockStatus, string> = {
    ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    bajo: "border-warning/30 bg-warning/10 text-warning",
    agotado: "border-destructive/30 bg-destructive/10 text-destructive",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${map[s]}`}>
      {STATUS_LABELS[s]}
    </span>
  );
}

function MovBadge({ k }: { k: MovKind }) {
  const map: Record<MovKind, string> = {
    entrada: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
    salida: "border-primary/30 bg-primary/10 text-primary",
    ajuste: "border-warning/30 bg-warning/10 text-warning",
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
  value: "todos" | StockStatus;
  onChange: (v: "todos" | StockStatus) => void;
}) {
  const tabs: Array<{ id: "todos" | StockStatus; label: string }> = [
    { id: "todos", label: "Todos" },
    { id: "ok", label: "Disponible" },
    { id: "bajo", label: "Stock bajo" },
    { id: "agotado", label: "Agotados" },
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

function FilterMenu({
  status,
  onStatus,
  zone,
  onZone,
}: {
  status: Set<StockStatus>;
  onStatus: (s: Set<StockStatus>) => void;
  zone: Set<Zone>;
  onZone: (s: Set<Zone>) => void;
}) {
  const toggleStatus = (id: StockStatus) => {
    const next = new Set(status);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onStatus(next);
  };
  const toggleZone = (id: Zone) => {
    const next = new Set(zone);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onZone(next);
  };
  const totalActive =
    (status.size < STATUS_FILTERS.length ? STATUS_FILTERS.length - status.size : 0) +
    (zone.size < ZONES.length ? ZONES.length - zone.size : 0);
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
          Estado
        </p>
        {STATUS_FILTERS.map((s) => (
          <CheckRow
            key={s.id}
            on={status.has(s.id)}
            label={s.label}
            onClick={() => toggleStatus(s.id)}
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
              onStatus(new Set(STATUS_FILTERS.map((s) => s.id)));
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
        className={`w-3.5 h-3.5 rounded border ${on ? "bg-primary border-primary" : "border-border"} flex items-center justify-center`}
      >
        {on && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
      </span>
      {label}
    </button>
  );
}

// Suppress unused-import warnings for icons reserved for future widgets
void PackageSearch;
