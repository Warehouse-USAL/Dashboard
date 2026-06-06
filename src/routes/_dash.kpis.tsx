import { createFileRoute } from "@tanstack/react-router";
import { Battery, Gauge, TrendingUp, Zap } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel, PageHeader } from "@/components/dashboard/Panel";
import { batteryTone, throughput, useLiveRovers, utilization } from "@/lib/dashboard-data";

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

function KpisPage() {
  const rovers = useLiveRovers();
  const totalOrders = throughput.reduce((a, b) => a + b.ordenes, 0);
  const avgTime = (throughput.reduce((a, b) => a + b.tiempo, 0) / throughput.length).toFixed(1);
  const avgBattery = Math.round(rovers.reduce((a, b) => a + b.battery, 0) / rovers.length);

  return (
    <div className="space-y-6">
      <PageHeader icon={TrendingUp} title="KPIs" description="Performance del sistema" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat icon={Gauge} label="Órdenes (24h)" value={String(totalOrders)} />
        <Stat icon={Zap} label="Tiempo prom. por orden" value={`${avgTime} min`} />
        <Stat icon={Battery} label="Batería prom." value={`${avgBattery}%`} />
      </div>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel
          title="Órdenes completadas / hora"
          subtitle="Últimas 24 horas"
          icon={Gauge}
          className="xl:col-span-2"
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={throughput}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.78 0.18 180)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="oklch(0.78 0.18 180)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.025 250)" />
              <XAxis dataKey="h" stroke="oklch(0.7 0.02 240)" fontSize={11} />
              <YAxis stroke="oklch(0.7 0.02 240)" fontSize={11} />
              <Tooltip {...tooltip} />
              <Area
                type="monotone"
                dataKey="ordenes"
                stroke="oklch(0.78 0.18 180)"
                strokeWidth={2}
                fill="url(#g1)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Uso de Rovers" subtitle="Distribución actual" icon={Zap}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={utilization}
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {utilization.map((u) => (
                  <Cell key={u.name} fill={u.color} stroke="none" />
                ))}
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
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Tiempo promedio por orden" subtitle="Minutos" icon={Gauge}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={throughput}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.025 250)" />
              <XAxis dataKey="h" stroke="oklch(0.7 0.02 240)" fontSize={11} />
              <YAxis stroke="oklch(0.7 0.02 240)" fontSize={11} />
              <Tooltip {...tooltip} />
              <Bar dataKey="tiempo" fill="oklch(0.78 0.18 60)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Estado actual de baterías" icon={Battery}>
          <div className="space-y-4">
            {rovers.map((r) => {
              const bt = batteryTone(r.battery);
              return (
                <div key={r.id}>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="font-medium">{r.id}</span>
                    <span className={`${bt.color} font-semibold`}>
                      {bt.label} · {Math.round(r.battery)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full ${bt.bar} transition-all`}
                      style={{ width: `${r.battery}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-5 flex items-center gap-4"
      style={{ background: "var(--gradient-surface)" }}
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}
