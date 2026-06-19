import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Battery, Search, Truck } from "lucide-react";
import { Panel, PageHeader } from "@/components/dashboard/Panel";
import { batteryTone, stateStyles, type RoverState } from "@/lib/dashboard-data";
import { useVehicles } from "@/hooks/useVehicles";

export const Route = createFileRoute("/_dash/vehiculos")({
  component: VehiculosPage,
  head: () => ({ meta: [{ title: "Vehículos · SmartWarehouse" }] }),
});

const tabs = ["todos", "activo", "cargando", "detenido", "inactivo"] as const;
type Tab = (typeof tabs)[number];

function VehiculosPage() {
  const { data: rovers } = useVehicles();
  const [tab, setTab] = useState<Tab>("todos");
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () =>
      rovers.filter((r) => {
        if (tab !== "todos" && r.state !== tab) return false;
        if (q && !`${r.id} ${r.name} ${r.zone}`.toLowerCase().includes(q.toLowerCase()))
          return false;
        return true;
      }),
    [rovers, tab, q],
  );

  const stats = useMemo(() => {
    const avgBattery = rovers.length
      ? Math.round(rovers.reduce((s, r) => s + r.battery, 0) / rovers.length)
      : 1;
    return {
      total: rovers.length,
      activo: rovers.filter((r) => r.state === "activo").length,
      cargando: rovers.filter((r) => r.state === "cargando").length,
      avgBattery,
    };
  }, [rovers]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Truck}
        title="Flota de Vehículos"
        description="Estado en tiempo real de los rovers"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Totales" value={stats.total} />
        <StatCard label="Activos" value={stats.activo} accent="primary" />
        <StatCard label="En carga" value={stats.cargando} accent="warning" />
        <StatCard
          label="Batería promedio"
          value={`${stats.avgBattery}%`}
          accent="info"
          icon={Battery}
        />
      </div>

      <Panel
        title="Rovers"
        subtitle={`${filtered.length} resultado${filtered.length === 1 ? "" : "s"}`}
        icon={Truck}
        action={
          <div className="flex gap-2">
            <div className="flex bg-secondary/40 border border-border rounded-md p-0.5">
              {tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1 text-[11px] rounded ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t}
                </button>
              ))}
            </div>
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
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left font-medium py-2 px-2">Rover</th>
                <th className="text-left font-medium py-2 px-2">Estado</th>
                <th className="text-left font-medium py-2 px-2">Batería</th>
                <th className="text-right font-medium py-2 px-2">Horas</th>
                <th className="text-left font-medium py-2 px-2">Zona</th>
                <th className="text-left font-medium py-2 px-2">Orden</th>
                <th className="text-left font-medium py-2 px-2">Posición</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const bt = batteryTone(r.battery);
                return (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30">
                    <td className="py-3 px-2 text-xs font-bold">
                      {r.id}
                      <span className="block text-[10px] text-muted-foreground font-normal">
                        {r.name}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <StatusBadge state={r.state} />
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${bt.bar}`}
                            style={{ width: `${r.battery}%` }}
                          />
                        </div>
                        <span className={`text-[10px] ${bt.color}`}>{Math.round(r.battery)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-xs text-right">{r.hours} h</td>
                    <td className="py-3 px-2 text-xs">{r.zone}</td>
                    <td className="py-3 px-2 text-xs">{r.order ?? "—"}</td>
                    <td className="py-3 px-2 text-xs text-muted-foreground">
                      x:{Math.round(r.x)} y:{Math.round(r.y)}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
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
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  accent?: "primary" | "warning" | "info";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const c =
    accent === "primary"
      ? "text-primary"
      : accent === "warning"
        ? "text-warning"
        : accent === "info"
          ? "text-info"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      {Icon && <Icon className={`w-5 h-5 ${c}`} />}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${c}`}>{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: RoverState }) {
  const style = stateStyles[state];
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${style}`}>
      {state === "activo"
        ? "Activo"
        : state === "cargando"
          ? "Cargando"
          : state === "detenido"
            ? "Detenido"
            : "Inactivo"}
    </span>
  );
}
