import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  PackageSearch, Search, DollarSign, AlertTriangle, Ban, CalendarDays,
  Archive, ArrowUpDown, ChevronDown, Check, Calendar as CalendarIcon,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Panel } from "@/components/dashboard/Panel";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useProducts } from "@/hooks/useProducts";

export const Route = createFileRoute("/_dash/inventario")({
  component: InventarioPage,
  head: () => ({ meta: [{ title: "Inventario · SmartWarehouse" }] }),
});

type SkuStatus = "ok" | "riesgo" | "quiebre" | "dead";
type SkuCategory = "Cajas" | "Pallets" | "Snacks" | "Bebidas" | string;

type SkuRow = {
  sku: string;
  producto: string;
  categoria: SkuCategory;
  gondola: string;
  reservado: number;
  disponible: number;
  demDiaria: number;
  cobertura: number; // días
  reorden: number;   // unidades sugeridas
  reqNeto: number;   // unidades adicionales requeridas
  valorStock: number; // ARS
  ultimaOrden: string; // dd/mm/yyyy
  estado: SkuStatus;
  // historial 14 días (unidades despachadas)
  demanda: number[];
  // proyección MRP 15 días (stock proyectado)
  proyeccion: number[];
  puntoReorden: number;
};



const STATUS_LABEL: Record<SkuStatus, string> = {
  ok: "OK", riesgo: "En riesgo", quiebre: "Quiebre", dead: "Dead stock",
};
const STATUS_STYLE: Record<SkuStatus, string> = {
  ok:      "border-emerald-500/30 bg-emerald-500/15 text-emerald-500",
  riesgo:  "border-orange-500/30 bg-orange-500/15 text-orange-500",
  quiebre: "border-rose-500/30 bg-rose-500/15 text-rose-500",
  dead:    "border-zinc-500/30 bg-zinc-500/15 text-zinc-400",
};

type SortKey = "cobertura" | "disponible" | "demDiaria" | "valorStock";
type StatusFilter = "todos" | SkuStatus;

function InventarioPage() {
  const { data: productsApi } = useProducts();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [sort, setSort] = useState<SortKey>("cobertura");
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedSku, setSelectedSku] = useState<string>("");
  const [rangeTop, setRangeTop] = useState<RangeKey>("24h");
  const [rangeMov, setRangeMov] = useState<RangeKey>("7d");
  const [rangeStock, setRangeStock] = useState<RangeKey>("7d");
  const [customTop, setCustomTop] = useState<DateRange | undefined>();
  const [customMov, setCustomMov] = useState<DateRange | undefined>();
  const [customStock, setCustomStock] = useState<DateRange | undefined>();

  const allRows = useMemo((): SkuRow[] =>
    productsApi.map((p) => ({
      sku: p.sku,
      producto: p.name,
      categoria: "General",
      gondola: p.zone,
      reservado: p.reserved ?? 0,
      disponible: p.available,
      demDiaria: 0,
      cobertura: p.status === "agotado" ? 0 : p.status === "bajo" ? 2 : 99,
      reorden: 0,
      reqNeto: 0,
      valorStock: 0,
      ultimaOrden: "—",
      estado: (p.status === "agotado" ? "quiebre" : p.status === "bajo" ? "riesgo" : "ok") as SkuStatus,
      demanda: [],
      proyeccion: [],
      puntoReorden: 0,
    })),
  [productsApi]);

  const rows = useMemo(() => {
    let r = allRows.filter((row) => {
      if (statusFilter !== "todos" && row.estado !== statusFilter) return false;
      if (q && !`${row.sku} ${row.producto} ${row.gondola}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    r = [...r].sort((a, b) => {
      const av = a[sort] as number;
      const bv = b[sort] as number;
      return sortAsc ? av - bv : bv - av;
    });
    return r;
  }, [allRows, q, statusFilter, sort, sortAsc]);

  // KPIs (derivados)
  const kpis = useMemo(() => {
    const valor = allRows.reduce((s, r) => s + r.valorStock, 0);
    const enRiesgo = allRows.filter((r) => r.estado === "riesgo").length;
    const enQuiebre = allRows.filter((r) => r.estado === "quiebre").length;
    const activos = allRows.filter((r) => r.estado !== "dead");
    const cobProm = activos.reduce((s, r) => s + r.cobertura, 0) / Math.max(1, activos.length);
    const dead = allRows.filter((r) => r.estado === "dead").reduce((s, r) => s + r.valorStock, 0);
    return { total: allRows.length, valor, enRiesgo, enQuiebre, cobProm, dead };
  }, [allRows]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">SmartWarehouse · Monitor</p>
          <h1 className="text-2xl font-bold tracking-tight">Inventario</h1>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard icon={DollarSign}    tone="primary"  label="Valor del inventario" value={fmtMoneyShort(kpis.valor)}      sub={`${kpis.total} SKUs en depósito`} />
        <KpiCard icon={AlertTriangle} tone="rose"     label="SKUs en riesgo"        value={kpis.enRiesgo.toString()}       sub="cobertura < 5 días" subTone="rose" />
        <KpiCard icon={Ban}           tone="rose"     label="En quiebre"            value={kpis.enQuiebre.toString()}      sub="stock disponible = 0" subTone="muted" />
        <KpiCard icon={CalendarDays}  tone="emerald"  label="Cobertura promedio"    value={`${kpis.cobProm.toFixed(1)} días`} sub="sobre SKUs activos" subTone="emerald" />
        <KpiCard icon={Archive}       tone="muted"    label="Dead stock (valor)"    value={fmtMoneyShort(kpis.dead)}       sub="sin mov. +7 días" subTone="muted" />
      </div>

      {/* Tabla de SKUs */}
      <Panel
        title="Tabla de SKUs"
        subtitle={`${rows.length} producto${rows.length === 1 ? "" : "s"} · actualizado hace 2 min`}
        icon={PackageSearch}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <SelectChip
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              options={[
                { v: "todos",   l: "Todos los estados" },
                { v: "ok",      l: "OK" },
                { v: "riesgo",  l: "En riesgo" },
                { v: "quiebre", l: "Quiebre" },
                { v: "dead",    l: "Dead stock" },
              ]}
            />
            <button
              onClick={() => setSortAsc((s) => !s)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md border border-border bg-secondary/40 hover:bg-secondary/60"
            >
              <ArrowUpDown className="w-3 h-3" />
              Ordenar: {sort === "cobertura" ? "días de cobertura" : sort} {sortAsc ? "↑" : "↓"}
            </button>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar SKU o nombre..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-secondary/40 focus:outline-none focus:border-primary w-56"
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
                <Th>Posición</Th>
                <Th className="text-right">Reservado</Th>
                <ThSort active={sort === "disponible"} onClick={() => { setSort("disponible"); }} className="text-right">Disponible</ThSort>
                <ThSort active={sort === "demDiaria"} onClick={() => { setSort("demDiaria"); }} className="text-right">Dem. diaria</ThSort>
                <ThSort active={sort === "cobertura"} onClick={() => { setSort("cobertura"); }}>Cobertura</ThSort>
                <Th className="text-right">Req. neto</Th>
                <ThSort active={sort === "valorStock"} onClick={() => { setSort("valorStock"); }} className="text-right">Valor stock</ThSort>
                <Th>Última orden</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isSel = r.sku === selectedSku;
                return (
                  <tr
                    key={r.sku}
                    onClick={() => setSelectedSku(r.sku)}
                    className={cn(
                      "border-b border-border/50 cursor-pointer transition-colors",
                      isSel ? "bg-amber-500/10" : "hover:bg-secondary/30",
                    )}
                  >
                    <td className="py-2.5 px-2 text-xs font-mono font-bold whitespace-nowrap">{r.sku}</td>
                    <td className="py-2.5 px-2 text-xs">{r.producto}</td>
                    <td className="py-2.5 px-2 text-xs text-muted-foreground">{r.gondola}</td>
                    <td className="py-2.5 px-2 text-xs text-right tabular-nums">{r.reservado}u</td>
                    <td className="py-2.5 px-2 text-xs text-right tabular-nums font-semibold">{r.disponible}u</td>
                    <td className="py-2.5 px-2 text-xs text-right tabular-nums">{r.demDiaria} u</td>
                    <td className="py-2.5 px-2"><CoverageBar dias={r.cobertura} /></td>
                    <td className="py-2.5 px-2 text-xs text-right tabular-nums">{r.reqNeto} u.</td>
                    <td className="py-2.5 px-2 text-xs text-right tabular-nums">{fmtMoneyShort(r.valorStock)}</td>
                    <td className="py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap">{r.ultimaOrden}</td>
                    <td className="py-2.5 px-2"><StatusBadge s={r.estado} /></td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={11} className="text-center py-8 text-xs text-muted-foreground">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Resumen visual: estado, ocupación por zona (mapa en vivo), top rotación */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <DistribucionEstadoCard rows={allRows} />
        <OcupacionZonaCard />
        <TopRotacionCard rows={allRows} range={rangeTop} onRangeChange={setRangeTop} customRange={customTop} onCustomChange={setCustomTop} />
      </div>



      {/* Movimientos de stock */}
      <Panel
        title="Movimientos de stock"
        subtitle="Entradas vs salidas"
        action={<RangeChip value={rangeStock} onChange={setRangeStock} range={customStock} onRangeChange={setCustomStock} />}
      >
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={getStockSeries(rangeStock, customStock)}
              margin={{ top: 6, right: 8, bottom: 0, left: -10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.01 250)" vertical={false} />
              <XAxis dataKey="d" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar dataKey="entradas" name="Entradas" fill="oklch(0.78 0.14 175)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="salidas"  name="Salidas"  fill="oklch(0.74 0.18 50)"  radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* Histórico de Movimientos */}
      {(() => {
        const filtered = filterMovimientos(MOVIMIENTOS, rangeMov, customMov);
        return (
        <Panel
          title="Histórico de Movimientos"
          subtitle={`${filtered.length} movimientos`}
          action={<RangeChip value={rangeMov} onChange={setRangeMov} range={customMov} onRangeChange={setCustomMov} />}
        >
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <Th>Fecha</Th>
                  <Th>SKU</Th>
                  <Th>Tipo</Th>
                  <Th className="text-center w-20">Cantidad</Th>
                  <Th>Nota</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => {
                  const tone = m.kind === "entrada"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-600 border-amber-500/30";
                  const label = m.kind === "entrada" ? "Entrada" : "Salida";
                  const signedQty = m.kind === "entrada" ? m.qty : -m.qty;
                  const qtyClass = signedQty > 0
                    ? "text-emerald-500"
                    : "text-amber-500";
                  return (
                    <tr key={`${m.sku}-${i}`} className="border-b border-border/50 hover:bg-secondary/30">
                      <td className="py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap">{m.fecha}</td>
                      <td className="py-2.5 px-2 text-xs font-mono font-bold">{m.sku}</td>
                      <td className="py-2.5 px-2">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border", tone)}>
                          {label}
                        </span>
                      </td>
                      <td className={cn("py-2.5 px-2 text-xs text-center tabular-nums font-semibold w-20", qtyClass)}>
                        {signedQty > 0 ? `+${signedQty}` : signedQty}
                      </td>
                      <td className="py-2.5 px-2 text-xs text-muted-foreground">{m.nota}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-xs text-muted-foreground">Sin movimientos en este rango</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
        );
      })()}
    </div>
  );
}

// --- subcomponents ---

function KpiCard({
  icon: Icon, label, value, sub, tone, subTone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub: string;
  tone: "primary" | "rose" | "emerald" | "muted";
  subTone?: "rose" | "emerald" | "muted";
}) {
  const toneCls: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    rose:    "text-rose-500 bg-rose-500/10",
    emerald: "text-emerald-500 bg-emerald-500/10",
    muted:   "text-muted-foreground bg-secondary/60",
  };
  const subCls = subTone === "rose" ? "text-rose-500"
    : subTone === "emerald" ? "text-emerald-500"
    : "text-muted-foreground";
  const valueCls = tone === "rose" ? "text-rose-500" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-7 h-7 rounded-md flex items-center justify-center", toneCls[tone])}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className={cn("text-2xl font-bold", valueCls)}>{value}</p>
      <p className={cn("text-[11px] mt-0.5", subCls)}>{sub}</p>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`font-medium py-2 px-2 ${className.includes("text-") ? className : `text-left ${className}`}`}>{children}</th>;
}
function ThSort({ children, onClick, active, className = "" }: { children: React.ReactNode; onClick: () => void; active: boolean; className?: string }) {
  return (
    <th className={`font-medium py-2 px-2 ${className.includes("text-") ? className : `text-left ${className}`}`}>
      <button onClick={onClick} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-primary")}>
        {children} <ArrowUpDown className="w-2.5 h-2.5 opacity-70" />
      </button>
    </th>
  );
}

function CoverageBar({ dias }: { dias: number }) {
  // 0d → quiebre (rosa), <2 rosa, 2-5 amber, 5-10 emerald-amber mix, >10 emerald
  const pct = Math.min(100, (dias / 14) * 100);
  const color = dias < 2 ? "bg-rose-500"
    : dias < 5 ? "bg-amber-500"
    : dias < 10 ? "bg-emerald-500"
    : "bg-emerald-600";
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="flex-1 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
        <div className={cn("h-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">{dias.toFixed(1)}d</span>
    </div>
  );
}

function StatusBadge({ s }: { s: SkuStatus }) {
  return <span className={cn("text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap", STATUS_STYLE[s])}>{STATUS_LABEL[s]}</span>;
}

function SelectChip<T extends string>({
  value, onChange, options,
}: {
  value: T; onChange: (v: T) => void;
  options: { v: T; l: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none pl-2.5 pr-7 py-1.5 text-[11px] rounded-md border border-border bg-secondary/40 hover:bg-secondary/60 focus:outline-none cursor-pointer"
      >
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
    </div>
  );
}

type RangeKey = "24h" | "7d" | "30d" | "90d" | "custom";
const RANGE_OPTIONS: { v: RangeKey; l: string }[] = [
  { v: "24h",    l: "Últimas 24 horas" },
  { v: "7d",     l: "Últimos 7 días" },
  { v: "30d",    l: "Últimos 30 días" },
  { v: "90d",    l: "Últimos 90 días" },
  { v: "custom", l: "Rango personalizado" },
];

function periodLabel(value: RangeKey, range?: DateRange): string {
  if (value === "custom") {
    if (range?.from && range?.to) return `${format(range.from, "dd/MM/yy")} – ${format(range.to, "dd/MM/yy")}`;
    if (range?.from) return `Desde ${format(range.from, "dd/MM/yy")}`;
    return "Rango personalizado";
  }
  return RANGE_OPTIONS.find((o) => o.v === value)!.l;
}

function RangeChip({
  value, onChange, range, onRangeChange,
}: {
  value: RangeKey;
  onChange: (v: RangeKey) => void;
  range?: DateRange;
  onRangeChange: (r: DateRange | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md border border-border bg-secondary/40 hover:bg-secondary/60">
          <CalendarIcon className="w-3.5 h-3.5" />
          {periodLabel(value, range)}
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2">
        <div className="flex">
          <div className="w-48 p-1 border-r border-border">
            {RANGE_OPTIONS.map((o) => (
              <button
                key={o.v}
                onClick={() => { onChange(o.v); if (o.v !== "custom") setOpen(false); }}
                className={cn(
                  "w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-secondary/60",
                  o.v === value && "bg-secondary/60",
                )}
              >
                {o.l}
                {o.v === value && <Check className="w-3 h-3 text-primary" />}
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
type Movimiento = { fecha: string; sku: string; kind: "entrada" | "salida"; qty: number; nota: string };
const MOVIMIENTOS: Movimiento[] = [
  { fecha: "26/05/2026 22:21", sku: "SKU-A102", kind: "salida",  qty:  3, nota: "OR-12511" },
  { fecha: "26/05/2026 21:21", sku: "SKU-C019", kind: "salida",  qty:  5, nota: "OR-12510" },
  { fecha: "26/05/2026 19:21", sku: "SKU-B441", kind: "entrada", qty: 12, nota: "Recepción" },
  { fecha: "26/05/2026 17:21", sku: "SKU-D227", kind: "salida",  qty:  2, nota: "OR-12508" },
  { fecha: "26/05/2026 09:21", sku: "SKU-A188", kind: "salida",  qty:  6, nota: "OR-12507" },
  { fecha: "26/05/2026 01:21", sku: "SKU-E412", kind: "entrada", qty: 10, nota: "Recepción" },
  { fecha: "25/05/2026 17:21", sku: "SKU-C077", kind: "salida",  qty:  4, nota: "OR-12498" },
  { fecha: "24/05/2026 23:21", sku: "SKU-D310", kind: "salida",  qty:  8, nota: "OR-12492" },
  { fecha: "23/05/2026 23:21", sku: "SKU-E308", kind: "salida",  qty:  1, nota: "OR-12485" },
  { fecha: "21/05/2026 23:21", sku: "SKU-A102", kind: "entrada", qty: 60, nota: "Recepción" },
  { fecha: "18/05/2026 14:05", sku: "SKU-B441", kind: "salida",  qty:  7, nota: "OR-12440" },
  { fecha: "14/05/2026 10:32", sku: "SKU-E412", kind: "salida",  qty:  9, nota: "OR-12388" },
  { fecha: "10/05/2026 18:12", sku: "SKU-A188", kind: "entrada", qty: 45, nota: "Recepción" },
  { fecha: "05/05/2026 09:45", sku: "SKU-D310", kind: "entrada", qty: 30, nota: "Recepción" },
  { fecha: "01/05/2026 16:20", sku: "SKU-C077", kind: "salida",  qty: 11, nota: "OR-12201" },
];

function parseFecha(s: string): number {
  const [d, t] = s.split(" ");
  const [dd, mm, yyyy] = d.split("/").map(Number);
  const [hh, mi] = t.split(":").map(Number);
  return new Date(yyyy, mm - 1, dd, hh, mi).getTime();
}
const NOW_REF = new Date(2026, 4, 26, 23, 59).getTime(); // 26/05/2026 23:59
const DAY_MS = 24 * 3600 * 1000;
const PRESET_DAYS: Record<Exclude<RangeKey, "custom">, number> = {
  "24h": 1, "7d": 7, "30d": 30, "90d": 90,
};

function rangeBounds(range: RangeKey, custom?: DateRange): { from: number; to: number } {
  if (range === "custom" && custom?.from && custom?.to) {
    const from = new Date(custom.from); from.setHours(0, 0, 0, 0);
    const to = new Date(custom.to);     to.setHours(23, 59, 59, 999);
    return { from: from.getTime(), to: to.getTime() };
  }
  const days = range === "custom" ? 7 : PRESET_DAYS[range];
  return { from: NOW_REF - days * DAY_MS, to: NOW_REF };
}
function rangeDays(range: RangeKey, custom?: DateRange): number {
  const { from, to } = rangeBounds(range, custom);
  return Math.max(1, Math.round((to - from) / DAY_MS));
}
function filterMovimientos(items: Movimiento[], range: RangeKey, custom?: DateRange): Movimiento[] {
  const { from, to } = rangeBounds(range, custom);
  return items.filter((m) => {
    const t = parseFecha(m.fecha);
    return t >= from && t <= to;
  });
}

const STOCK_SERIES: Record<Exclude<RangeKey, "custom">, { d: string; entradas: number; salidas: number }[]> = {
  "24h": [
    { d: "00h", entradas: 18, salidas: 24 },
    { d: "04h", entradas: 12, salidas: 16 },
    { d: "08h", entradas: 42, salidas: 55 },
    { d: "12h", entradas: 58, salidas: 72 },
    { d: "16h", entradas: 48, salidas: 64 },
    { d: "20h", entradas: 30, salidas: 38 },
  ],
  "7d": [
    { d: "Lun", entradas: 240, salidas: 320 },
    { d: "Mar", entradas: 285, salidas: 360 },
    { d: "Mié", entradas: 310, salidas: 385 },
    { d: "Jue", entradas: 260, salidas: 340 },
    { d: "Vie", entradas: 335, salidas: 415 },
    { d: "Sáb", entradas: 175, salidas: 205 },
    { d: "Dom", entradas: 120, salidas: 140 },
  ],
  "30d": [
    { d: "Sem 1", entradas: 1420, salidas: 1680 },
    { d: "Sem 2", entradas: 1605, salidas: 1820 },
    { d: "Sem 3", entradas: 1480, salidas: 1750 },
    { d: "Sem 4", entradas: 1725, salidas: 2005 },
  ],
  "90d": [
    { d: "Mar", entradas: 5980, salidas: 6940 },
    { d: "Abr", entradas: 6320, salidas: 7280 },
    { d: "May", entradas: 6760, salidas: 7820 },
  ],
};

function getStockSeries(range: RangeKey, custom?: DateRange) {
  if (range !== "custom") return STOCK_SERIES[range];
  if (!custom?.from || !custom?.to) return STOCK_SERIES["7d"];
  const days = rangeDays("custom", custom);
  // build a daily series sampled across the custom range
  const points = Math.min(days, 14);
  const step = Math.max(1, Math.floor(days / points));
  const out: { d: string; entradas: number; salidas: number }[] = [];
  let cursor = new Date(custom.from);
  for (let i = 0; i < points; i++) {
    const ent = 200 + Math.round(120 * Math.sin(i * 0.7) + 80);
    const sal = ent + 60 + Math.round(40 * Math.cos(i * 0.5));
    out.push({ d: format(cursor, "dd/MM"), entradas: ent, salidas: sal });
    cursor = new Date(cursor.getTime() + step * DAY_MS);
  }
  return out;
}


// --- helpers ---

function fmtMoneyShort(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v}`;
}

// --- resumen cards ---

function DistribucionEstadoCard({ rows }: { rows: SkuRow[] }) {
  const total = rows.length;
  const counts = {
    ok: rows.filter((r) => r.estado === "ok").length,
    riesgo: rows.filter((r) => r.estado === "riesgo").length,
    quiebre: rows.filter((r) => r.estado === "quiebre").length,
    dead: rows.filter((r) => r.estado === "dead").length,
  };
  const data = [
    { name: "Disponible",  value: counts.ok,      color: "oklch(0.72 0.16 165)" },
    { name: "En riesgo",   value: counts.riesgo,  color: "oklch(0.78 0.18 80)" },
    { name: "Quiebre",     value: counts.quiebre, color: "oklch(0.65 0.24 27)" },
    { name: "Dead stock",  value: counts.dead,    color: "oklch(0.6 0.01 250)" },
  ].filter((d) => d.value > 0);
  return (
    <Panel title="Distribución por estado" subtitle="Últimos 7 días">
      <div className="flex items-center gap-4">
        <div className="relative w-[140px] h-[140px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={62} stroke="none" paddingAngle={2}>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold leading-none">{total}</span>
            <span className="text-[10px] text-muted-foreground mt-0.5">SKUs</span>
          </div>
        </div>
        <ul className="flex-1 space-y-1.5">
          {data.map((d) => {
            const pct = total ? Math.round((d.value / total) * 100) : 0;
            return (
              <li key={d.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="flex-1 truncate">{d.name}</span>
                <span className="tabular-nums font-semibold">{d.value}</span>
                <span className="tabular-nums text-muted-foreground w-10 text-right">({pct}%)</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
  );
}

// Zonas alineadas al mapa en vivo del depósito
const ZONAS_OCUPACION = [
  { zona: "Zona A", used: 380, cap: 500 },
  { zona: "Zona B", used: 210, cap: 300 },
  { zona: "Zona C", used: 85,  cap: 160 },
  { zona: "Zona D", used: 45,  cap: 120 },
];

function OcupacionZonaCard() {
  return (
    <Panel title="Ocupación por zona" subtitle="Capacidad utilizada · mapa en vivo">
      <ul className="space-y-3">
        {ZONAS_OCUPACION.map((z) => {
          const pct = Math.round((z.used / z.cap) * 100);
          const color = pct >= 80 ? "bg-rose-500"
            : pct >= 65 ? "bg-amber-500"
            : "bg-emerald-500";
          return (
            <li key={z.zona}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold">{z.zona}</span>
                <span className="tabular-nums text-muted-foreground">
                  {z.used}/{z.cap} <span className="ml-1">({pct}%)</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
                <div className={cn("h-full transition-all", color)} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function TopRotacionCard({
  rows, range, onRangeChange, customRange, onCustomChange,
}: {
  rows: SkuRow[]; range: RangeKey; onRangeChange: (v: RangeKey) => void;
  customRange?: DateRange; onCustomChange: (r: DateRange | undefined) => void;
}) {
  const days = rangeDays(range, customRange);
  const mult = days;
  const unitLabel = range === "24h" ? "u/d" : range === "7d" ? "u/sem" : range === "30d" ? "u/mes" : `u/${days}d`;
  const subtitle = range === "24h" ? "Unidades / día"
    : range === "7d" ? "Unidades / semana"
    : range === "30d" ? "Unidades / mes"
    : range === "90d" ? "Unidades / trimestre"
    : `Unidades en ${days} días`;
  const top = [...rows]
    .map((r) => ({ ...r, total: Math.round(r.demDiaria * mult) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const max = Math.max(1, ...top.map((r) => r.total));
  return (
    <Panel title="Top rotación" subtitle={subtitle} action={<RangeChip value={range} onChange={onRangeChange} range={customRange} onRangeChange={onCustomChange} />}>
      <ol className="space-y-3">
        {top.map((r, i) => {
          const pct = (r.total / max) * 100;
          return (
            <li key={r.sku} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground tabular-nums w-3">{i + 1}</span>
                  <span className="font-mono font-semibold">{r.sku}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">{r.total} {unitLabel}</span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}


