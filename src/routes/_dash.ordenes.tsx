import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ListChecks, Search } from "lucide-react";
import { Panel, PageHeader } from "@/components/dashboard/Panel";
import { useOrders } from "@/hooks/useOrders";

export const Route = createFileRoute("/_dash/ordenes")({
  component: OrdenesPage,
  head: () => ({ meta: [{ title: "Órdenes · SmartWarehouse" }] }),
});

const tabs = ["todas", "en proceso", "en espera"] as const;
type Tab = (typeof tabs)[number];

function OrdenesPage() {
  const { data: orders } = useOrders();
  const [tab, setTab] = useState<Tab>("todas");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (tab !== "todas" && o.state !== tab) return false;
      if (q && !`${o.id} ${o.product} ${o.rover}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [orders, tab, q]);

  const stats = {
    total: orders.length,
    proceso: orders.filter((o) => o.state === "en proceso").length,
    espera: orders.filter((o) => o.state === "en espera").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ListChecks}
        title="Órdenes"
        description="Gestión de la cola de retiro"
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Totales" value={stats.total} />
        <StatCard label="En proceso" value={stats.proceso} accent="primary" />
        <StatCard label="En espera" value={stats.espera} accent="info" />
      </div>

      <Panel
        title="Cola de órdenes"
        subtitle={`${filtered.length} resultado${filtered.length === 1 ? "" : "s"}`}
        icon={ListChecks}
        action={
          <div className="flex gap-2">
            <div className="flex bg-secondary/40 border border-border rounded-md p-0.5">
              {tabs.map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-3 py-1 text-[11px] rounded ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar..." className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-secondary/40 focus:outline-none focus:border-primary w-40" />
            </div>
          </div>
        }
      >
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left font-medium py-2 px-2">Orden</th>
                <th className="text-left font-medium py-2 px-2">Producto</th>
                <th className="text-right font-medium py-2 px-2">Cant.</th>
                <th className="text-left font-medium py-2 px-2">Prioridad</th>
                <th className="text-left font-medium py-2 px-2">Estado</th>
                <th className="text-left font-medium py-2 px-2">Rover</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-secondary/30">
                  <td className="py-3 px-2 text-xs font-bold">{o.id}</td>
                  <td className="py-3 px-2 text-xs text-muted-foreground">{o.product}</td>
                  <td className="py-3 px-2 text-xs text-right">×{o.qty}</td>
                  <td className="py-3 px-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      o.priority === "alta" ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : o.priority === "media" ? "border-warning/30 bg-warning/10 text-warning"
                      : "border-border bg-secondary text-muted-foreground"}`}>
                      {o.priority}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      o.state === "en proceso" ? "border-primary bg-primary text-primary-foreground"
                      : "border-info/40 bg-info/10 text-info"}`}>
                      {o.state}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-xs">{o.rover}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: "primary" | "info" }) {
  const c = accent === "primary" ? "text-primary" : accent === "info" ? "text-info" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${c}`}>{value}</p>
    </div>
  );
}
