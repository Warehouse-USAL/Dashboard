import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BatteryLow,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  HeartPulse,
  LayoutDashboard,
  Map as MapIcon,
  Package,
  Radio,
  ShieldAlert,
  Target,
  Truck,
  Warehouse,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel, PageHeader } from "@/components/dashboard/Panel";
import { WarehouseMap } from "@/components/dashboard/WarehouseMap";
import { alertTone, alerts, batteryTone, stateStyles, throughput } from "@/lib/dashboard-data";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleWebSocket } from "@/hooks/useVehicleWebSocket";
import { useOrders } from "@/hooks/useOrders";
import { useProducts } from "@/hooks/useProducts";

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

const alertIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "battery-low": BatteryLow,
  "shield-alert": ShieldAlert,
  radio: Radio,
  "alert-triangle": AlertTriangle,
};

function HomePage() {
  const { data: rovers } = useVehicles();
  const { data: orders } = useOrders();
  const { data: products } = useProducts();
  useVehicleWebSocket();
  const animatedRovers = useAnimatedRovers(rovers);

  const topSkus = useMemo(() => {
    const counts = new Map<string, number>();
    orders
      .filter((o) => o.state === "completada")
      .forEach((o) => {
        const sku = o.product.split(" ")[0];
        counts.set(sku, (counts.get(sku) ?? 0) + o.qty);
      });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [orders]);

  const inProcess = orders.filter((o) => o.state === "en proceso").length;
  const totalOrders = orders.length;
  const completadas = orders.filter((o) => o.state === "completada").length;
  const canceladas = orders.filter((o) => o.state === "cancelada").length;
  const compliance =
    completadas + canceladas > 0 ? Math.round((completadas / (completadas + canceladas)) * 100) : 0;

  const inventarioValor = useMemo(() => {
    const total = products.reduce((sum, p) => sum + (p.available * p.priceCents) / 100, 0);
    if (total === 0) return "—";
    if (total >= 1_000_000) return `$${(total / 1_000_000).toFixed(1)}M`;
    if (total >= 1_000) return `$${(total / 1_000).toFixed(0)}K`;
    return `$${Math.round(total).toLocaleString("es-AR")}`;
  }, [products]);

  const picking = throughput.map((t) => ({ h: t.h, unidades: t.ordenes * 2 + 30 }));
  const ordersHour = throughput.map((t, i) => ({
    h: t.h,
    completadas: t.ordenes,
    canceladas: Math.max(0, Math.round(t.ordenes * 0.08) - (i % 3 === 0 ? 0 : 1)),
  }));
  const stockDuration = products.slice(0, 5).map((p) => ({
    sku: p.sku,
    dias: p.status === "agotado" ? 0 : p.status === "bajo" ? 4 : p.available > 100 ? 11 : 7,
    status: p.status,
  }));
  const stockColor = (st: string) =>
    st === "agotado"
      ? "oklch(0.65 0.24 27)"
      : st === "bajo"
        ? "oklch(0.78 0.18 60)"
        : "oklch(0.78 0.18 180)";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Home"
        description="Vista general del warehouse · Tiempo real"
      />

      {/* KPIs */}
      <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label="Top SKUs"
          value={topSkus[0]?.[0] ?? "—"}
          icon={Package}
          trend={`${topSkus.length} más solicitados`}
          accent="primary"
        />
        <KpiCard
          label="Ocupación almacén"
          value="—"
          icon={Warehouse}
          trend={`${products.length} SKUs activos`}
          accent="primary"
        />
        <KpiCard
          label="Órdenes en proceso"
          value={String(inProcess)}
          icon={Activity}
          trend={`${totalOrders} totales`}
          accent="accent"
        />
        <KpiCard
          label="Valor del inventario"
          value={inventarioValor}
          icon={DollarSign}
          trend="stock disponible × precio"
          accent="primary"
        />
        <KpiCard
          label="Cumplimiento"
          value={`${compliance}%`}
          icon={CheckCircle2}
          trend="completadas vs canceladas"
          accent="primary"
        />
        <KpiCard
          label="Latido de flota"
          value="—"
          icon={HeartPulse}
          trend="MTBF · requiere Grafana"
          accent="destructive"
        />
      </section>

      {/* Mapa + Alertas */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel
          title="Mapa del warehouse"
          subtitle="Layout y posición de rovers"
          icon={MapIcon}
          className="xl:col-span-2"
        >
          <WarehouseMap rovers={animatedRovers} />
          <div className="flex flex-wrap gap-3 mt-3 text-[11px]">
            <LegendDot color="bg-primary" label="Activo" />
            <LegendDot color="bg-warning" label="Cargando" />
            <LegendDot color="bg-destructive" label="Detenido" />
            <LegendDot color="bg-muted-foreground" label="Inactivo" />
          </div>
        </Panel>

        <Panel
          title="Alertas críticas"
          subtitle={`${alerts.length} eventos sin reconocer`}
          icon={Bell}
          action={
            <Link
              to="/alertas"
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Todas <ChevronRight className="w-3 h-3" />
            </Link>
          }
        >
          <div className="space-y-2">
            {alerts.slice(0, 5).map((a) => {
              const Icon = alertIconMap[a.icon] ?? AlertTriangle;
              return (
                <div
                  key={a.id}
                  className={`rounded-lg border p-3 flex gap-3 items-start ${alertTone(a.level)}`}
                >
                  <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{a.type}</p>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      {a.rover} · {a.time}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </section>

      {/* Rovers + Top SKUs */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel
          title="Estado de rovers"
          subtitle="Batería y operación"
          icon={Truck}
          className="xl:col-span-2"
        >
          <div className="space-y-2">
            {rovers.map((r) => {
              const bt = batteryTone(r.battery);
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border"
                >
                  <Truck className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">{r.id}</span>
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
        </Panel>

        <Panel title="Top SKUs" subtitle="Unidades pedidas" icon={Target}>
          <div className="space-y-2">
            {topSkus.map(([sku, q]) => {
              const max = topSkus[0]?.[1] ?? 1;
              return (
                <div key={sku} className="p-3 rounded-lg bg-secondary/30 border border-border">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-bold">{sku}</span>
                    <span className="text-[11px] text-muted-foreground">{q} u</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${(q / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Eficiencia de picking" subtitle="Unidades por hora" icon={Clock}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={picking}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.025 250)" />
              <XAxis dataKey="h" stroke="oklch(0.7 0.02 240)" fontSize={11} />
              <YAxis stroke="oklch(0.7 0.02 240)" fontSize={11} />
              <Tooltip {...tooltip} />
              <Bar dataKey="unidades" fill="oklch(0.78 0.18 180)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Órdenes por hora" subtitle="Completadas vs canceladas" icon={Activity}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ordersHour}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.025 250)" />
              <XAxis dataKey="h" stroke="oklch(0.7 0.02 240)" fontSize={11} />
              <YAxis stroke="oklch(0.7 0.02 240)" fontSize={11} />
              <Tooltip {...tooltip} />
              <Bar dataKey="completadas" stackId="a" fill="oklch(0.78 0.18 180)" />
              <Bar
                dataKey="canceladas"
                stackId="a"
                fill="oklch(0.65 0.24 27)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 text-[10px] mt-2 text-muted-foreground justify-center">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-primary" />
              Completadas
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-destructive" />
              Canceladas
            </span>
          </div>
        </Panel>

        <Panel title="Duración del stock" subtitle="Días hasta quiebre" icon={Warehouse}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stockDuration} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.025 250)" />
              <XAxis type="number" stroke="oklch(0.7 0.02 240)" fontSize={11} />
              <YAxis
                type="category"
                dataKey="sku"
                stroke="oklch(0.7 0.02 240)"
                fontSize={10}
                width={60}
              />
              <Tooltip {...tooltip} />
              <Bar dataKey="dias" radius={[0, 4, 4, 0]}>
                {stockDuration.map((s) => (
                  <Cell key={s.sku} fill={stockColor(s.status)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend: string;
  accent: "primary" | "accent" | "destructive";
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
      <div className="flex justify-between items-start mb-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${accentMap[accent]}`}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold tracking-tight truncate">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{trend}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={`w-2 h-2 rounded-full ${color}`} /> {label}
    </span>
  );
}

// Animate rovers' positions in real time, bouncing within aisle/zone bounds.
function useAnimatedRovers(rovers: import("@/lib/dashboard-data").Rover[]) {
  const [tick, setTick] = useState(0);
  const stateRef = useRef<Map<string, { x: number; y: number; vx: number; vy: number }>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  // Seed/refresh per-rover state when source changes
  useEffect(() => {
    const m = stateRef.current;
    const seen = new Set<string>();
    rovers.forEach((r) => {
      seen.add(r.id);
      if (!m.has(r.id)) {
        const moving = r.state === "activo";
        // Snap Y to nearest aisle band center (32 or 60)
        const band = Math.abs(r.y - 32) < Math.abs(r.y - 60) ? 32 : 60;
        m.set(r.id, {
          x: r.x,
          y: moving ? band : r.y,
          vx: moving ? (r.vx >= 0 ? 1 : -1) * 0.8 : 0,
          vy: 0,
        });
      }
    });
    for (const k of m.keys()) if (!seen.has(k)) m.delete(k);
  }, [rovers]);

  useEffect(() => {
    const step = (t: number) => {
      const dt = lastRef.current ? Math.min(64, t - lastRef.current) : 16;
      lastRef.current = t;
      const m = stateRef.current;
      rovers.forEach((r) => {
        const s = m.get(r.id);
        if (!s) return;
        if (r.state !== "activo") {
          s.vx = 0;
          s.vy = 0;
          return;
        }
        // Straight-line motion along the aisle (Y locked)
        s.x += s.vx * (dt / 32);
        // Bounce within almacén x: 22..96
        if (s.x < 22) {
          s.x = 22;
          s.vx = Math.abs(s.vx);
        }
        if (s.x > 96) {
          s.x = 96;
          s.vx = -Math.abs(s.vx);
        }
      });
      setTick((n) => (n + 1) % 1_000_000);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastRef.current = 0;
    };
  }, [rovers]);

  return useMemo(() => {
    void tick;
    return rovers.map((r) => {
      const s = stateRef.current.get(r.id);
      return s ? { ...r, x: s.x, y: s.y } : r;
    });
  }, [rovers, tick]);
}
