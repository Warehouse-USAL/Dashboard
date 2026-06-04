import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  BatteryLow,
  Bell,
  Boxes,
  ChevronRight,
  Clock,
  Cpu,
  LayoutDashboard,
  ListChecks,
  Radio,
  ShieldAlert,
  Truck,
  Zap,
} from "lucide-react";
import { Panel, PageHeader } from "@/components/dashboard/Panel";
import { alertTone, alerts, batteryTone, stateStyles, throughput } from "@/lib/dashboard-data";
import { useVehicles } from "@/hooks/useVehicles";
import { useOrders } from "@/hooks/useOrders";

export const Route = createFileRoute("/_dash/")({
  component: ResumenPage,
  head: () => ({
    meta: [{ title: "Resumen · SmartWarehouse" }],
  }),
});

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "battery-low": BatteryLow,
  "shield-alert": ShieldAlert,
  clock: Clock,
  radio: Radio,
  "alert-triangle": AlertTriangle,
  boxes: Boxes,
};

function ResumenPage() {
  const { data: rovers } = useVehicles();
  const { data: orders } = useOrders();
  const activeCount = useMemo(() => rovers.filter((r) => r.state === "activo").length, [rovers]);
  const inProgress = orders.filter((o) => o.state === "en proceso").length;
  const waiting    = orders.filter((o) => o.state === "en espera").length;
  const avgTime    = (throughput.reduce((a, b) => a + b.tiempo, 0) / throughput.length).toFixed(1);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Resumen general"
        description="Vista consolidada del almacén automatizado en tiempo real"
      />

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Rovers Activos" value={`${activeCount}/${rovers.length}`} icon={Truck} trend="+1 vs ayer" accent="primary" />
        <KpiCard label="Órdenes en Curso" value={String(inProgress)} icon={Activity} trend={`${waiting} en espera`} accent="accent" />
        <KpiCard label="Tiempo prom. por orden" value={`${avgTime} min`} icon={Zap} trend="últimas 24 horas" accent="primary" />
        <KpiCard label="Alertas Activas" value={String(alerts.length)} icon={ShieldAlert} trend="2 críticas" accent="destructive" />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel
          title="Rovers en operación"
          icon={Cpu}
          className="xl:col-span-2"
          action={
            <Link to="/mapa" className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver mapa <ChevronRight className="w-3 h-3" />
            </Link>
          }
        >
          <div className="space-y-2">
            {rovers.map((r) => {
              const bt = batteryTone(r.battery);
              return (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border">
                  <Truck className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">{r.id}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${stateStyles[r.state]}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" /> {r.state}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {r.zone} · {r.order ?? "sin orden"}
                    </p>
                  </div>
                  <div className="w-24">
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

        <Panel
          title="Alertas recientes"
          subtitle={`${alerts.length} eventos`}
          icon={Bell}
          action={
            <Link to="/alertas" className="text-xs text-primary hover:underline flex items-center gap-1">
              Todas <ChevronRight className="w-3 h-3" />
            </Link>
          }
        >
          <div className="space-y-2">
            {alerts.slice(0, 5).map((a) => {
              const Icon = iconMap[a.icon] ?? AlertTriangle;
              return (
                <div key={a.id} className={`rounded-lg border p-3 flex gap-3 items-start ${alertTone(a.level)}`}>
                  <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{a.type}</p>
                    <p className="text-[11px] opacity-80 mt-0.5">{a.rover} · {a.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-6">
        <Panel
          title="Próximas órdenes"
          icon={ListChecks}
          action={
            <Link to="/ordenes" className="text-xs text-primary hover:underline flex items-center gap-1">
              Gestionar <ChevronRight className="w-3 h-3" />
            </Link>
          }
        >
          <div className="space-y-2">
            {orders.slice(0, 5).map((o) => (
              <div key={o.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border">
                <div className={`w-1 h-10 rounded-full ${o.priority === "alta" ? "bg-destructive" : o.priority === "media" ? "bg-warning" : "bg-primary"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold">{o.id}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{o.product}</p>
                </div>
                <span className="text-[10px] text-muted-foreground">{o.rover}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function KpiCard({
  label, value, icon: Icon, trend, accent,
}: {
  label: string; value: string;
  icon: React.ComponentType<{ className?: string }>;
  trend: string; accent: "primary" | "accent" | "destructive";
}) {
  const accentMap = {
    primary: "text-primary bg-primary/10",
    accent: "text-accent-foreground bg-accent",
    destructive: "text-destructive bg-destructive/10",
  };
  return (
    <div className="relative rounded-xl border border-border bg-card p-5 overflow-hidden hover:border-primary/30 transition" style={{ background: "var(--gradient-surface)" }}>
      <div className="flex justify-between items-start mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accentMap[accent]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{trend}</p>
    </div>
  );
}
