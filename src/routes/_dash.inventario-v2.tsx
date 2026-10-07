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
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useInventoryMetrics, type EnrichedProduct } from "@/hooks/useInventoryMetrics";
import type { FrontendRestock } from "@/lib/api";
import { usePagedList } from "@/hooks/usePagination";
import { TablePagination } from "@/components/dashboard/TablePagination";
import { SourceBadge } from "@/components/dashboard/SourceBadge";
import type { DataSource } from "@/lib/data-source";
import { TemporalBadge } from "@/components/dashboard/TemporalBadge";
import { live, period as periodTemporal, dailyRun, restockWindow } from "@/lib/temporality";
import type { Temporality } from "@/lib/temporality";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dash/inventario-v2")({
  component: InventarioPage,
  head: () => ({ meta: [{ title: "Inventario · SmartWarehouse" }] }),
});

// ─── Types ────────────────────────────────────────────────────────────────────

// Estado único del producto: se resuelve una sola vez en `mapProduct` (api.ts) a
// partir del stock disponible y de la recomendación del cron de reposición.
type ProductStatus = EnrichedProduct["status"];

const STATUS_LIST: ProductStatus[] = ["a_reponer", "agotado", "ok"];

const STATUS_LABEL: Record<ProductStatus, string> = {
  ok: "OK",
  a_reponer: "A reponer",
  agotado: "Agotado",
};

const STATUS_CSS: Record<ProductStatus, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  a_reponer: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  agotado: "border-destructive/30 bg-destructive/10 text-destructive",
};

const STATUS_COLOR: Record<ProductStatus, string> = {
  ok: "oklch(0.78 0.18 160)",
  a_reponer: "oklch(0.78 0.18 80)",
  agotado: "oklch(0.65 0.24 27)",
};

/**
 * "Agotado" y "A reponer" son dos hechos independientes y pueden ser ciertos a la
 * vez (el caso más urgente), así que filtros y pestañas no comparan contra
 * `p.status` — que sólo resuelve el badge de la fila, con "agotado" primero.
 * "OK" es no estar en ninguno de los dos.
 */
function matchesStatus(p: EnrichedProduct, s: ProductStatus): boolean {
  if (s === "agotado") return p.isDepleted;
  if (s === "a_reponer") return p.needsRestock;
  return !p.isDepleted && !p.needsRestock;
}

type SortKey =
  | "sku"
  | "name"
  | "zone"
  | "physical"
  | "reserved"
  | "available"
  | "priceCents"
  // Pendiente (vuelven con `blended_demand`): columnas "Dem. diaria"/"Cobertura".
  // | "dailyDemand"
  // | "coverageDays"
  | "stockValue"
  | "lastOrderDaysAgo"
  | "suggestedQuantity"
  | "status";

const ZONES = ["A", "B", "C", "D", "E"] as const;
type Zone = (typeof ZONES)[number];

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

/**
 * Precio unitario exacto, con la moneda del producto. No usa `fmtMoney`: esa
 * abrevia ($1.250 → "$1K"), que sirve para totales pero no para un precio.
 */
function fmtPrice(priceCents: number, currency: string): string {
  if (priceCents <= 0) return "—";
  try {
    return (priceCents / 100).toLocaleString("es-AR", { style: "currency", currency });
  } catch {
    // moneda que Intl no reconoce: se muestra el número con el código al lado
    return `${(priceCents / 100).toLocaleString("es-AR")} ${currency}`;
  }
}

function fmtCoverage(days: number): string {
  if (days >= 9999) return "∞";
  if (days === 0) return "0d";
  if (days < 1) return "<1d";
  return `${Math.round(days)}d`;
}

function fmtDemand(d: number): string {
  if (d < 0.01) return "—";
  // 2 decimales, no 1: con 1 decimal, varios SKUs con demanda real distinta
  // (0.53, 0.49, 0.47 u/d) redondeaban al mismo "0.5" en pantalla mientras la
  // barra de "Top rotación" —que sí usa el valor sin redondear— se veía con
  // largos distintos para el mismo número mostrado.
  if (d < 1) return d.toFixed(2);
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

/** Número de stock con a lo sumo un decimal: el cron devuelve ROP/objetivo con muchos. */
function fmtStockNum(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}

/**
 * Explica de dónde sale (o por qué no hay) la cantidad sugerida. Usa sólo lo que
 * guarda `product.restock`: la posición de inventario (disponible + lo pedido que
 * todavía no está ubicado) contra el punto de reposición y el stock objetivo.
 */
function restockHint(r: FrontendRestock): string {
  const pos = fmtStockNum(r.inventoryPosition);
  const rop = fmtStockNum(r.reorderPoint);
  const calc = `Calculado el ${format(new Date(r.calculatedAt), "dd/MM HH:mm")}.`;
  if (r.shouldRestock) {
    return `Posición de inventario ${pos} ≤ punto de reposición ${rop}. Se repone hasta el stock objetivo de ${fmtStockNum(r.targetStock)}. ${calc}`;
  }
  if (r.inventoryPosition > r.reorderPoint) {
    return `Posición de inventario ${pos} > punto de reposición ${rop}: no hace falta reponer. ${calc}`;
  }
  return `Posición de inventario ${pos}, punto de reposición ${rop}: no hay cantidad para reponer. ${calc}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

function InventarioPage() {
  const [zoneFilter, setZoneFilter] = useState<Set<Zone>>(new Set(ZONES));
  const [statusFilter, setStatusFilter] = useState<Set<ProductStatus>>(new Set(STATUS_LIST));
  const [tableTab, setTableTab] = useState<"todos" | ProductStatus>("todos");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("sku");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [period, setPeriod] = useState<PeriodId>("7d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  // period/customRange drive dailyDemand/coverageDays on the table + "Top
  // rotación" (exploratory) and the mock "Movimientos" panel below. They do
  // NOT drive `status` (viene de la recomendación diaria del cron) ni el KPI de
  // dead stock, que usa la ventana fija del cron (deadStockDays) para que un
  // período corto no haga parpadear las alertas. See useInventoryMetrics.
  const { products, kpis, zoneOccupancy, deadStockDays } = useInventoryMetrics(period, customRange);

  const dataPeriod: DataPeriodId = useMemo(() => {
    if (period !== "custom") return period;
    if (!customRange?.from || !customRange?.to) return "30d";
    const days = Math.ceil((customRange.to.getTime() - customRange.from.getTime()) / 86_400_000);
    if (days <= 1) return "24h";
    if (days <= 7) return "7d";
    if (days <= 30) return "30d";
    return "90d";
  }, [period, customRange]);

  // Estado del catálogo — dos hechos independientes (pueden superponerse), por
  // eso son barras sobre el total y no una dona que tendría que sumar 100%.
  // Salen de los mismos conteos que los KPIs de arriba.
  const statusTotal = products.length;
  const statusBars = [
    { key: "a_reponer" as const, name: STATUS_LABEL.a_reponer, value: kpis.skusToRestock },
    { key: "agotado" as const, name: STATUS_LABEL.agotado, value: kpis.skusDepleted },
  ];

  // Zone occupancy — real Σ current_stock / Σ maximum_capacity per zone from backend positions
  const occupancy = useMemo(() => {
    return zoneOccupancy
      .filter((z) => zoneFilter.has(z.zone as Zone) || !ZONES.includes(z.zone as Zone))
      .map((z) => {
        const pct = z.capacity > 0 ? Math.min(100, Math.round((z.stock / z.capacity) * 100)) : 0;
        const tone = pct >= 85 ? "bg-rose-500" : pct >= 65 ? "bg-amber-500" : "bg-emerald-500";
        return { zone: z.zone, used: z.stock, cap: z.capacity, pct, tone };
      });
  }, [zoneOccupancy, zoneFilter]);

  // Top 5 by daily demand (rotation)
  const topRotacion = useMemo(
    () => [...products].sort((a, b) => b.dailyDemand - a.dailyDemand).slice(0, 5),
    [products],
  );

  // Cuándo corrió por última vez el cron de reposición. La recomendación es una
  // foto diaria: si pasó más de un día, el cron no está corriendo y "A reponer"
  // está desactualizado — hay que decirlo en vez de mostrarlo como si fuera actual.
  const restockFreshness = useMemo(() => {
    const times = products
      .map((p) => p.restockCalculatedAt)
      .filter((t): t is string => !!t)
      .map((t) => new Date(t).getTime());
    if (times.length === 0) return null;
    const latest = Math.max(...times);
    return { latest, stale: Date.now() - latest > 24 * 3_600_000 };
  }, [products]);

  // Filtered + sorted table
  const filteredTable = useMemo(() => {
    let list = products.filter((p) => {
      if (tableTab !== "todos" && !matchesStatus(p, tableTab)) return false;
      if (!STATUS_LIST.some((s) => statusFilter.has(s) && matchesStatus(p, s))) return false;
      const z = p.zone.split("-")[0] as Zone;
      if ((ZONES as readonly string[]).includes(z) && !zoneFilter.has(z)) return false;
      if (q && !`${p.sku} ${p.name} ${p.positionDisplay}`.toLowerCase().includes(q.toLowerCase()))
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
        case "physical":
          cmp = a.physical - b.physical;
          break;
        case "reserved":
          cmp = a.reserved - b.reserved;
          break;
        case "available":
          cmp = a.available - b.available;
          break;
        case "priceCents":
          cmp = a.priceCents - b.priceCents;
          break;
        // Pendiente (vuelven con `blended_demand`): columnas "Dem. diaria"/"Cobertura".
        // case "dailyDemand":
        //   cmp = a.riskDailyDemand - b.riskDailyDemand;
        //   break;
        // case "coverageDays":
        //   cmp = a.riskCoverageDays - b.riskCoverageDays;
        //   break;
        case "stockValue":
          cmp = a.stockValue - b.stockValue;
          break;
        case "lastOrderDaysAgo":
          cmp = (a.lastOrderDaysAgo ?? 9999) - (b.lastOrderDaysAgo ?? 9999);
          break;
        case "suggestedQuantity":
          cmp = (a.suggestedQuantity ?? 0) - (b.suggestedQuantity ?? 0);
          break;
        case "status":
          cmp = STATUS_LIST.indexOf(a.status) - STATUS_LIST.indexOf(b.status);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [products, tableTab, statusFilter, zoneFilter, q, sortKey, sortDir]);

  const {
    page: productsPage,
    setPage: setProductsPage,
    totalPages: productsTotalPages,
    pageItems: pagedProducts,
    from: productsFrom,
    to: productsTo,
    total: productsTotal,
  } = usePagedList(filteredTable, 10);

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
        <div className="flex items-center gap-2 flex-wrap">
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border bg-card hover:bg-secondary/40">
            <Download className="w-3.5 h-3.5" /> Exportar
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border bg-card hover:bg-secondary/40">
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>
      </div>

      {/* ── 5 KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={DollarSign}
          label="Valor del inventario"
          value={fmtMoney(kpis.totalValue)}
          sub="stock físico × precio"
          tone="primary"
          temporal={live()}
        />
        <KpiCard
          icon={AlertTriangle}
          label="SKUs a reponer"
          value={kpis.skusToRestock.toString()}
          sub="recomendación del cron de reposición"
          tone="warning"
          temporal={dailyRun()}
        />
        <KpiCard
          icon={PackageX}
          label="Agotados"
          value={kpis.skusDepleted.toString()}
          sub="stock disponible = 0"
          tone="danger"
          temporal={live()}
        />
        {/* Pendiente: "Cobertura promedio" vuelve cuando `product.restock` exponga
            `blended_demand`. Antes se calculaba sobre la Ventana de riesgo configurable.
        <KpiCard
          icon={Clock}
          label="Cobertura promedio"
          value={`${kpis.avgCoverage.toFixed(1)}d`}
          sub="días de stock restante"
          tone="info"
          temporal={dailyRun()}
        />
        */}
        <KpiCard
          icon={TrendingDown}
          label="Dead stock (valor)"
          value={fmtMoney(kpis.deadStockValue)}
          sub={`${kpis.deadStockCount} SKU${kpis.deadStockCount === 1 ? "" : "s"} sin órdenes en ${deadStockDays} días`}
          tone="muted"
          temporal={restockWindow(deadStockDays)}
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
        <p
          className={cn(
            "text-[11px] mb-2",
            !restockFreshness || restockFreshness.stale
              ? "text-amber-500"
              : "text-muted-foreground",
          )}
        >
          {restockFreshness
            ? `Recomendación de reposición calculada el ${format(new Date(restockFreshness.latest), "dd/MM HH:mm")}${restockFreshness.stale ? " · hace más de 24 h: el cron debería haber corrido" : ""}`
            : "Sin recomendación de reposición todavía: el cron aún no corrió"}
        </p>
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
                <SortTh k="physical" active={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Físico
                </SortTh>
                <SortTh k="reserved" active={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Reservado
                </SortTh>
                <SortTh k="available" active={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Disponible
                </SortTh>
                <SortTh k="priceCents" active={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Precio
                </SortTh>
                {/* Pendiente: "Dem. diaria" y "Cobertura" vuelven cuando `product.restock`
                    exponga `blended_demand`. Antes usaban la Ventana de riesgo configurable.
                <SortTh k="dailyDemand" active={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Dem. diaria
                </SortTh>
                <SortTh k="coverageDays" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  Cobertura
                </SortTh>
                */}
                <SortTh k="stockValue" active={sortKey} dir={sortDir} onSort={toggleSort} right>
                  Valor stock
                </SortTh>
                <SortTh k="lastOrderDaysAgo" active={sortKey} dir={sortDir} onSort={toggleSort}>
                  Última orden
                </SortTh>
                <SortTh
                  k="suggestedQuantity"
                  active={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                  right
                  title="Cantidad que sugiere el cron de reposición (se calcula una vez por día)"
                >
                  Cant. sugerida
                </SortTh>
                <SortTh
                  k="status"
                  active={sortKey}
                  dir={sortDir}
                  onSort={toggleSort}
                  title="A reponer: lo recomienda el cron diario. Agotado: stock disponible = 0"
                >
                  Estado
                </SortTh>
              </tr>
            </thead>
            <tbody>
              {pagedProducts.map((p) => (
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
        <TablePagination
          page={productsPage}
          totalPages={productsTotalPages}
          onPageChange={setProductsPage}
          from={productsFrom}
          to={productsTo}
          total={productsTotal}
          itemLabel="productos"
        />
      </Panel>

      {/* ── Row 2: Estado + Occupancy + Top Rotación ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Estado del catálogo — barras independientes, no una dona: "A reponer" y
            "Agotado" pueden ser ciertos a la vez, así que no suman el total. */}
        <Panel
          title="Estado del catálogo"
          subtitle={`${statusTotal} SKUs · un producto puede estar en los dos`}
        >
          <div className="space-y-3">
            {statusBars.map((b) => {
              const pct = statusTotal ? Math.round((b.value / statusTotal) * 100) : 0;
              return (
                <div key={b.key} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={{ background: STATUS_COLOR[b.key] }}
                      />
                      {b.name}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {b.value} de {statusTotal} <span className="opacity-60">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                    <div
                      className="h-full"
                      style={{ width: `${pct}%`, background: STATUS_COLOR[b.key] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Zone occupancy */}
        <Panel
          title="Ocupación por zona"
          subtitle="Stock disponible / capacidad"
          action={<TemporalBadge value={live()} />}
        >
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

        {/* Top rotación — único panel de la página que usa el período elegido,
            así que es el único que necesita el picker; por eso vive acá y no
            en el header general (el resto de los datos son en vivo, de la
            corrida diaria del cron o de su ventana fija, no de esto). */}
        <Panel
          title="Top rotación"
          subtitle={`Mayor demanda diaria · ${periodLabel(period, customRange)}`}
          action={
            <div className="flex items-center gap-2">
              <TemporalBadge value={periodTemporal(periodLabel(period, customRange))} />
              <PeriodPicker
                value={period}
                onChange={setPeriod}
                range={customRange}
                onRangeChange={setCustomRange}
              />
            </div>
          }
        >
          <div className="space-y-2">
            {topRotacion.map((p, i) => {
              const max = topRotacion[0]?.dailyDemand || 1;
              const pct = max > 0 ? Math.round((p.dailyDemand / max) * 100) : 0;
              return (
                <div key={p.sku} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-muted-foreground w-3 tabular-nums shrink-0">
                        {i + 1}
                      </span>
                      <span className="font-semibold truncate" title={p.name}>
                        {p.name}
                      </span>
                    </span>
                    <span className="text-muted-foreground tabular-nums shrink-0">
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
          <div className="flex items-center gap-2">
            <TemporalBadge value={periodTemporal(periodLabel(period, customRange))} />
            <SourceBadge source="mock" />
          </div>
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
          <div className="flex items-center gap-2">
            <SourceBadge source="mock" />
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
  // Pendiente: la barra de cobertura vuelve junto con la columna "Cobertura",
  // cuando `product.restock` exponga `blended_demand`.
  // const coverPct =
  //   p.riskCoverageDays >= 9999 ? 100 : Math.min(100, (p.riskCoverageDays / 30) * 100);
  // const coverTone =
  //   p.riskCoverageDays >= 9999
  //     ? "bg-muted-foreground/40"
  //     : p.riskCoverageDays < 5
  //       ? "bg-destructive"
  //       : p.riskCoverageDays < 15
  //         ? "bg-amber-500"
  //         : "bg-emerald-500";

  return (
    <tr className="border-b border-border/50 hover:bg-secondary/30">
      <td className="py-3 px-2 text-xs font-mono font-bold">{p.sku}</td>
      <td className="py-3 px-2 text-xs max-w-[160px] truncate" title={p.name}>
        {p.name}
      </td>
      <td className="py-3 px-2 text-xs font-mono text-muted-foreground">{p.positionDisplay}</td>
      <td className="py-3 px-2 text-xs text-right tabular-nums">{p.physical}</td>
      <td className="py-3 px-2 text-xs text-right tabular-nums text-muted-foreground">
        {p.reserved}
      </td>
      <td className="py-3 px-2 text-xs text-right tabular-nums font-semibold">{p.available}</td>
      <td className="py-3 px-2 text-xs text-right tabular-nums whitespace-nowrap">
        {fmtPrice(p.priceCents, p.currency)}
      </td>
      {/* Pendiente: celdas "Dem. diaria" y "Cobertura" (ver encabezado de la tabla).
      <td className="py-3 px-2 text-xs text-right tabular-nums text-muted-foreground">
        {fmtDemand(p.riskDailyDemand)}
      </td>
      <td className="py-3 px-2">
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
            <div className={`h-full ${coverTone}`} style={{ width: `${coverPct}%` }} />
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground whitespace-nowrap">
            {fmtCoverage(p.riskCoverageDays)}
          </span>
        </div>
      </td>
      */}
      <td className="py-3 px-2 text-xs text-right tabular-nums">
        {p.priceCents > 0 ? fmtMoney(p.stockValue) : "—"}
      </td>
      <td className="py-3 px-2 text-xs text-muted-foreground whitespace-nowrap">
        {fmtLastOrder(p.lastOrderDate, p.lastOrderDaysAgo)}
      </td>
      <td
        className={cn(
          "py-3 px-2 text-xs text-right tabular-nums font-semibold",
          p.restock && "cursor-help",
        )}
        title={p.restock ? restockHint(p.restock) : "Sin recomendación todavía"}
      >
        {p.suggestedQuantity && p.suggestedQuantity > 0 ? p.suggestedQuantity : "—"}
      </td>
      <td className="py-3 px-2">
        <StatusBadge s={p.status} />
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
  title,
  children,
}: {
  k: SortKey;
  active: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  right?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  const isActive = active === k;
  const Icon = isActive ? (dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      title={title}
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
  temporal,
  source = "live",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  tone: "primary" | "warning" | "danger" | "info" | "muted";
  temporal: Temporality;
  source?: DataSource;
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
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center ${toneCls[tone]}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">
            {label}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <TemporalBadge value={temporal} />
          <SourceBadge source={source} />
        </div>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function StatusBadge({ s }: { s: ProductStatus }) {
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_CSS[s]}`}
    >
      {STATUS_LABEL[s]}
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
  value: "todos" | ProductStatus;
  onChange: (v: "todos" | ProductStatus) => void;
}) {
  const tabs: Array<{ id: "todos" | ProductStatus; label: string }> = [
    { id: "todos", label: "Todos" },
    { id: "a_reponer", label: STATUS_LABEL.a_reponer },
    { id: "agotado", label: STATUS_LABEL.agotado },
    { id: "ok", label: STATUS_LABEL.ok },
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
  status: Set<ProductStatus>;
  onStatus: (s: Set<ProductStatus>) => void;
}) {
  const toggleZone = (z: Zone) => {
    const next = new Set(zone);
    if (next.has(z)) next.delete(z);
    else next.add(z);
    onZone(next);
  };
  const toggleStatus = (s: ProductStatus) => {
    const next = new Set(status);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onStatus(next);
  };
  const active =
    (zone.size < ZONES.length ? ZONES.length - zone.size : 0) +
    (status.size < STATUS_LIST.length ? STATUS_LIST.length - status.size : 0);
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
        {STATUS_LIST.map((s) => (
          <CheckRow
            key={s}
            on={status.has(s)}
            label={STATUS_LABEL[s]}
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
              onStatus(new Set(STATUS_LIST));
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
