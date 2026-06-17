import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Battery,
  CalendarClock,
  DollarSign,
  Gauge,
  Package,
  PauseCircle,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Truck,
  Zap,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Panel, PageHeader } from "@/components/dashboard/Panel";
import {
  alerts, batteryTone, orders, stock, throughput, utilization,
} from "@/lib/dashboard-data";
import { useVehicles } from "@/hooks/useVehicles";

export const Route = createFileRoute("/_dash/kpis")({
  component: KpisPage,
  head: () => ({ meta: [{ title: "KPIs · SmartWarehouse" }] }),
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

// SKU unit prices (same as home)
const SKU_PRICES: Record<string, number> = {
  "SKU-A102": 1850,
  "SKU-B441": 12400,
  "SKU-C019": 980,
  "SKU-D227": 3200,
  "SKU-E308": 8900,
};

// per-SKU daily demand (units/day) for stock duration and replenishment
const SKU_DEMAND: Record<string, number> = {
  "SKU-A102": 18,
  "SKU-B441": 4,
  "SKU-C019": 12,
  "SKU-D227": 6,
  "SKU-E308": 3,
};
const SKU_MIN: Record<string, number> = {
  "SKU-A102": 90,
  "SKU-B441": 20,
  "SKU-C019": 60,
  "SKU-D227": 30,
  "SKU-E308": 15,
};
const SKU_LEAD: Record<string, number> = {
  "SKU-A102": 4,
  "SKU-B441": 7,
  "SKU-C019": 3,
  "SKU-D227": 5,
  "SKU-E308": 7,
};

function KpisPage() {
  return (
    <div className="space-y-8">
      <PageHeader icon={TrendingUp} title="KPIs" description="Indicadores clave de performance del sistema" />
      <OrdersSection />
      <VehiclesSection />
      <StockSection />
    </div>
  );
}

/* ============================================================
   ÓRDENES
============================================================ */
function OrdersSection() {
  const totalOrders = throughput.reduce((a, b) => a + b.ordenes, 0);
  const avgTime = (throughput.reduce((a, b) => a + b.tiempo, 0) / throughput.length).toFixed(1);
  const completion = 91; // tasa cumplimiento
  const pickingEff = (totalOrders / throughput.length / 10).toFixed(1); // u/h proxy

  // mock picking efficiency per hour
  const pickingData = throughput.map((t) => ({ h: t.h, u: Math.round(40 + t.ordenes * 2 + Math.random() * 8) }));

  const criticas = alerts.filter((a) => a.level === "critical").length;
  const adv = alerts.filter((a) => a.level === "warning").length;
  const info = alerts.filter((a) => a.level === "info").length;
  const totalAlertas = alerts.length;

  return (
    <SectionCard accent="primary" icon={Gauge} title="KPIs de órdenes" subtitle="Volumen, tiempos y cumplimiento de las órdenes procesadas">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Gauge} label="Órdenes (24h)" value={String(totalOrders)} accent="primary" />
        <Stat icon={Zap} label="Tiempo prom. por orden" value={`${avgTime} min`} accent="primary" />
        <Stat icon={Gauge} label="Tasa de cumplimiento" value={`${completion}%`} accent="primary" />
        <Stat icon={Package} label="Eficiencia de picking" value={`${pickingEff} u/h`} accent="primary" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
        <Panel title="Órdenes completadas / hora" subtitle="Últimas 24 horas" icon={Gauge} className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={throughput}>
              <defs>
                <linearGradient id="ord-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.78 0.13 180)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="oklch(0.78 0.13 180)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 250)" />
              <XAxis dataKey="h" stroke="oklch(0.5 0.02 240)" fontSize={11} />
              <YAxis stroke="oklch(0.5 0.02 240)" fontSize={11} />
              <Tooltip {...tooltip} />
              <Area type="monotone" dataKey="ordenes" stroke="oklch(0.7 0.14 180)" strokeWidth={2.5} fill="url(#ord-grad)" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Tiempo promedio por orden" subtitle="Minutos" icon={Gauge}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={throughput}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 250)" />
              <XAxis dataKey="h" stroke="oklch(0.5 0.02 240)" fontSize={11} />
              <YAxis stroke="oklch(0.5 0.02 240)" fontSize={11} />
              <Tooltip {...tooltip} />
              <Bar dataKey="tiempo" fill="oklch(0.78 0.18 60)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <Panel title="Eficiencia de picking por hora" subtitle="Unidades" icon={Package}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={pickingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 250)" />
              <XAxis dataKey="h" stroke="oklch(0.5 0.02 240)" fontSize={11} />
              <YAxis stroke="oklch(0.5 0.02 240)" fontSize={11} />
              <Tooltip {...tooltip} />
              <Bar dataKey="u" fill="oklch(0.7 0.18 150)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Tasa de incidentes" subtitle="Últimas 24 horas" icon={ShieldAlert}>
          <div className="flex items-center gap-4 mb-5">
            <div className="w-12 h-12 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total alertas</p>
              <p className="text-3xl font-bold">{totalAlertas}</p>
            </div>
          </div>
          <div className="space-y-3">
            <IncidentBar label="Críticas" value={criticas} total={totalAlertas} color="bg-destructive" textClass="text-destructive" />
            <IncidentBar label="Advertencias" value={adv} total={totalAlertas} color="bg-warning" textClass="text-warning" />
            <IncidentBar label="Informativas" value={info} total={totalAlertas} color="bg-primary" textClass="text-warning" />
          </div>
        </Panel>
      </div>
    </SectionCard>
  );
}

function IncidentBar({ label, value, total, color, textClass }: { label: string; value: number; total: number; color: string; textClass: string }) {
  const pct = total ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className={`font-semibold ${textClass}`}>{label}</span>
        <span className="font-mono font-semibold">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ============================================================
   VEHÍCULOS
============================================================ */
function VehiclesSection() {
  const { data: rovers } = useVehicles();
  const avgBattery = Math.round(rovers.reduce((a, b) => a + b.battery, 0) / rovers.length);
  const activos = rovers.filter((r) => r.state === "activo").length;
  const totalOrders = throughput.reduce((a, b) => a + b.ordenes, 0);
  const ordersPerRover = activos ? Math.round(totalOrders / activos) : 0;
  const inactivos = rovers.filter((r) => r.state !== "activo").length;
  const inactividadPct = Math.round((inactivos / rovers.length) * 100);
  const disponibilidad = 100 - inactividadPct;

  return (
    <SectionCard accent="warning" icon={Truck} title="KPIs de vehículos" subtitle="Estado, disponibilidad y productividad de la flota de rovers">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat icon={Battery} label="Batería prom." value={`${avgBattery}%`} accent="warning" />
        <Stat icon={Truck} label="Órdenes / rover activo" value={String(ordersPerRover)} accent="warning" />
        <Stat icon={PauseCircle} label="Inactividad" value={`${inactividadPct}%`} accent="warning" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-6">
        <Panel title="Uso de Rovers" subtitle="Distribución actual" icon={Zap}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={utilization} innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {utilization.map((u) => <Cell key={u.name} fill={u.color} stroke="none" />)}
              </Pie>
              <Tooltip {...tooltip} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {utilization.map((u) => (
              <div key={u.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: u.color }} />
                  {u.name}
                </div>
                <span className="font-semibold">{u.value}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Estado actual de baterías" icon={Battery}>
          <div className="space-y-4">
            {rovers.map((r) => {
              const bt = batteryTone(r.battery);
              return (
                <div key={r.id}>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="font-medium">{r.id}</span>
                    <span className={`${bt.color} font-semibold`}>{bt.label} · {Math.round(r.battery)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className={`h-full ${bt.bar} transition-all`} style={{ width: `${r.battery}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Productividad y disponibilidad" subtitle="Rovers activos" icon={Truck}>
          <div className="space-y-4">
            <MiniMetric icon={Truck} label="Órdenes / rover activo" value={String(ordersPerRover)} />
            <MiniMetric icon={PauseCircle} label="Inactividad" value={`${inactividadPct}%`} />
            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="font-medium">Disponibilidad</span>
                <span className="font-semibold">{disponibilidad}%</span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-warning transition-all" style={{ width: `${disponibilidad}%` }} />
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </SectionCard>
  );
}

function MiniMetric({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-warning/10 text-warning flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

/* ============================================================
   STOCK
============================================================ */
function StockSection() {
  const stockRisk = stock.filter((s) => s.status !== "ok");
  const stockOk = stock.filter((s) => s.status === "ok");
  const stockValueBySku = stock
    .map((s) => ({ sku: s.sku, name: s.name, qty: s.available, value: s.available * (SKU_PRICES[s.sku] ?? 0), status: s.status }))
    .sort((a, b) => b.value - a.value);
  const stockValue = stockValueBySku.reduce((a, b) => a + b.value, 0);
  const maxValue = Math.max(...stockValueBySku.map((s) => s.value), 1);

  const durations = stock.map((s) => {
    const dem = SKU_DEMAND[s.sku] ?? 5;
    const days = s.available === 0 ? 0 : s.available / dem;
    return { sku: s.sku, dias: Number(days.toFixed(1)) };
  });
  const avgDuration = Math.round(durations.reduce((a, b) => a + b.dias, 0) / durations.length);

  // Ventas históricas (14 días) por SKU — picos sintéticos
  const days = Array.from({ length: 14 }, (_, i) => (i === 13 ? "Hoy" : `L-${13 - i}`));
  const salesData = days.map((d, i) => {
    const base = Math.sin((i / 13) * Math.PI * 2) * 6 + Math.sin((i / 13) * Math.PI * 4) * 4;
    return {
      d,
      "SKU-A102": Math.max(2, Math.round(18 + base * 1.6 + (i === 9 ? 8 : 0) + (i === 3 ? 10 : 0))),
      "SKU-B441": Math.max(1, Math.round(5 + base * 0.6)),
      "SKU-C019": Math.max(2, Math.round(11 + base * 1.1 + (i === 9 ? 6 : 0))),
      "SKU-D227": Math.max(1, Math.round(6 + base * 0.9)),
      "SKU-E308": Math.max(1, Math.round(3 + base * 0.5)),
    };
  });
  const peakDay = "L-4";
  const peakVal = 74;

  // Replenishment recommendation
  const replen = stock.map((s) => {
    const dem = SKU_DEMAND[s.sku] ?? 5;
    const min = SKU_MIN[s.sku] ?? 20;
    const lead = SKU_LEAD[s.sku] ?? 5;
    const target = min + dem * 14;
    const reorder = Math.max(0, target - s.available);
    const days = s.available === 0 ? 0 : Math.max(0, Math.floor((s.available - min) / dem));
    let urgency: "ya" | "ahora" | "ok";
    if (s.available === 0) urgency = "ya";
    else if (s.available < min) urgency = "ahora";
    else urgency = "ok";
    return { ...s, dem, min, lead, reorder, days, urgency };
  }).sort((a, b) => {
    const order = { ya: 0, ahora: 1, ok: 2 };
    return order[a.urgency] - order[b.urgency];
  });

  return (
    <SectionCard accent="success" icon={Package} title="KPIs de stock" subtitle="Inventario, riesgo de quiebre, demanda y reposición">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={AlertTriangle} label="Stock en riesgo" value={`${stockRisk.length} SKUs`} accent="success" />
        <Stat icon={DollarSign} label="Valor del stock" value={`$ ${formatNum(stockValue)}`} accent="success" />
        <Stat icon={CalendarClock} label="Duración media stock" value={`${avgDuration} días`} accent="success" />
        <Stat icon={TrendingUp} label="Pico de demanda" value={`${peakVal}u · ${peakDay}`} accent="success" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <Panel title="Stock en riesgo" subtitle="Requiere atención" icon={AlertTriangle}>
          <div className="space-y-2">
            {stockRisk.map((s) => {
              const isCritical = s.status === "agotado";
              return (
                <div
                  key={s.sku}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    isCritical
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-warning/30 bg-warning/5"
                  }`}
                >
                  <div className={`w-1 self-stretch rounded-full ${isCritical ? "bg-destructive" : "bg-warning"}`} />
                  <div className="flex-1 px-3">
                    <p className="font-semibold text-sm">{s.sku}</p>
                    <p className="text-xs text-muted-foreground">{s.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{s.available}</p>
                    <p className={`text-[10px] uppercase tracking-wider font-bold ${isCritical ? "text-destructive" : "text-warning"}`}>
                      {s.status}
                    </p>
                  </div>
                </div>
              );
            })}
            <p className="text-center text-xs text-muted-foreground pt-2">
              {stockOk.length} SKUs con stock normal
            </p>
          </div>
        </Panel>

        <Panel title="Valor del stock por SKU" subtitle="Inventario valorizado" icon={DollarSign}>
          <div className="space-y-3">
            {stockValueBySku.map((s) => (
              <div key={s.sku}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-medium">{s.sku}</span>
                  <span className="font-mono font-semibold">$ {formatNum(s.value)}</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(s.value / maxValue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="flex justify-between pt-3 border-t border-border text-sm">
              <span className="text-muted-foreground">Total valorizado</span>
              <span className="font-bold">$ {formatNum(stockValue)}</span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Duración estimada del stock" subtitle="Días hasta quiebre · prevención" icon={CalendarClock} className="mt-6">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={durations} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 250)" />
            <XAxis type="number" stroke="oklch(0.5 0.02 240)" fontSize={11} domain={[0, 12]} />
            <YAxis type="category" dataKey="sku" stroke="oklch(0.5 0.02 240)" fontSize={11} width={80} />
            <Tooltip {...tooltip} />
            <Bar dataKey="dias" radius={[0, 4, 4, 0]}>
              {durations.map((d) => (
                <Cell
                  key={d.sku}
                  fill={d.dias <= 3 ? "oklch(0.6 0.22 27)" : d.dias <= 7 ? "oklch(0.78 0.18 60)" : "oklch(0.78 0.13 180)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-5 text-xs mt-3">
          <LegendDot color="oklch(0.6 0.22 27)" label="≤ 3 días" />
          <LegendDot color="oklch(0.78 0.18 60)" label="≤ 7 días" />
          <LegendDot color="oklch(0.78 0.13 180)" label="> 7 días" />
        </div>
      </Panel>

      <Panel title="Ventas históricas por producto" subtitle="Últimos 14 días · estimación de picos de demanda" icon={TrendingUp} className="mt-6">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={salesData}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 250)" />
            <XAxis dataKey="d" stroke="oklch(0.5 0.02 240)" fontSize={11} />
            <YAxis stroke="oklch(0.5 0.02 240)" fontSize={11} />
            <Tooltip {...tooltip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="SKU-A102" stroke="oklch(0.78 0.13 180)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="SKU-B441" stroke="oklch(0.65 0.17 150)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="SKU-C019" stroke="oklch(0.78 0.18 60)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="SKU-D227" stroke="oklch(0.7 0.18 320)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="SKU-E308" stroke="oklch(0.6 0.22 27)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-warning" />
          Pico de demanda detectado: <strong>{peakVal} unidades</strong> el día <strong>{peakDay}</strong>
        </div>
      </Panel>

      <Panel title="Recomendación de reposición" subtitle="Cuándo y cuánto reponer · basado en duración estimada y stock mínimo" icon={RefreshCw} className="mt-6">
        <div className="space-y-2">
          {replen.map((r) => {
            const critical = r.urgency !== "ok";
            const urgencyLabel = r.urgency === "ya" ? "REPONER YA" : r.urgency === "ahora" ? "REPONER AHORA" : "OK";
            const urgencyClass = r.urgency === "ya" || r.urgency === "ahora" ? "text-destructive" : "text-warning";
            const leadLabel =
              r.urgency === "ya"
                ? "Inmediato (sin stock)"
                : `En ${r.days} días (lead time ${r.lead}d)`;
            return (
              <div
                key={r.sku}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  critical ? "border-destructive/30 bg-destructive/5" : "border-border bg-secondary/30"
                }`}
              >
                <div className={`w-1 self-stretch rounded-full ${critical ? "bg-destructive" : "bg-warning"}`} />
                <div className="flex-1 px-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{r.sku}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${urgencyClass}`}>{urgencyLabel}</span>
                  </div>
                  <p className="text-xs">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Disp. {r.available}u · Mín. {r.min}u · Demanda {r.dem}u/d
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Reponer</p>
                  <p className="font-bold text-lg">{r.reorder}u</p>
                  <p className="text-[10px] text-muted-foreground">{leadLabel}</p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Cobertura objetivo: stock mínimo + 14 días de demanda. La fecha sugerida descuenta el lead time del proveedor.
        </p>
      </Panel>
    </SectionCard>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

/* ============================================================
   Shared bits
============================================================ */
type Accent = "primary" | "warning" | "success";

const accentBar: Record<Accent, string> = {
  primary: "bg-primary",
  warning: "bg-warning",
  success: "bg-success",
};
const accentText: Record<Accent, string> = {
  primary: "text-warning",
  warning: "text-warning",
  success: "text-success",
};
const accentBg: Record<Accent, string> = {
  primary: "bg-primary/15 text-warning",
  warning: "bg-warning/15 text-warning",
  success: "bg-success/15 text-success",
};

function SectionCard({
  accent, icon: Icon, title, subtitle, children,
}: {
  accent: Accent;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="relative rounded-2xl border border-border bg-card/40 p-5 sm:p-6 overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accentBar[accent]}`} />
      <header className="flex items-center gap-3 mb-5">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accentBg[accent]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h2 className={`text-base font-bold tracking-tight uppercase ${accentText[accent]}`}>{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function Stat({
  icon: Icon, label, value, accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: Accent;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4" style={{ background: "var(--gradient-surface)" }}>
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${accentBg[accent]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
        <p className="text-2xl font-bold truncate">{value}</p>
      </div>
    </div>
  );
}

function formatNum(n: number) {
  return n.toLocaleString("es-AR");
}

// keep imported but unused-friendly
void orders;
