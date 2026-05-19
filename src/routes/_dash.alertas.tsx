import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AlertTriangle, BatteryLow, Bell, Boxes, CheckCircle2, Clock, Radio, ShieldAlert,
} from "lucide-react";
import { Panel, PageHeader } from "@/components/dashboard/Panel";
import { alertTone, alerts } from "@/lib/dashboard-data";

export const Route = createFileRoute("/_dash/alertas")({
  component: AlertasPage,
  head: () => ({ meta: [{ title: "Alertas · SmartWarehouse" }] }),
});

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  "battery-low": BatteryLow, "shield-alert": ShieldAlert, clock: Clock,
  radio: Radio, "alert-triangle": AlertTriangle, boxes: Boxes,
};

function AlertasPage() {
  const [acknowledged, setAcknowledged] = useState<Set<number>>(new Set());
  const [level, setLevel] = useState<"todas" | "critical" | "warning" | "info">("todas");

  const filtered = useMemo(
    () => alerts.filter((a) => level === "todas" || a.level === level),
    [level],
  );

  const counts = {
    critical: alerts.filter((a) => a.level === "critical").length,
    warning: alerts.filter((a) => a.level === "warning").length,
    info: alerts.filter((a) => a.level === "info").length,
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={Bell} title="Centro de Alertas" description="Eventos y notificaciones del sistema" />

      <div className="grid grid-cols-3 gap-4">
        <SeverityCard label="Críticas" value={counts.critical} accent="destructive" active={level === "critical"} onClick={() => setLevel(level === "critical" ? "todas" : "critical")} />
        <SeverityCard label="Advertencias" value={counts.warning} accent="warning" active={level === "warning"} onClick={() => setLevel(level === "warning" ? "todas" : "warning")} />
        <SeverityCard label="Informativas" value={counts.info} accent="primary" active={level === "info"} onClick={() => setLevel(level === "info" ? "todas" : "info")} />
      </div>

      <Panel
        title="Eventos"
        subtitle={`${filtered.length} eventos · ${acknowledged.size} reconocidos`}
        icon={Bell}
        action={
          <button onClick={() => setAcknowledged(new Set(alerts.map((a) => a.id)))}
            className="text-xs px-3 py-1.5 rounded-md border border-border bg-secondary/40 hover:bg-secondary">
            Reconocer todas
          </button>
        }
      >
        <div className="space-y-2">
          {filtered.map((a) => {
            const Icon = iconMap[a.icon] ?? AlertTriangle;
            const ack = acknowledged.has(a.id);
            return (
              <div key={a.id} className={`rounded-lg border p-4 flex gap-3 items-start ${alertTone(a.level)} ${ack ? "opacity-50" : ""}`}>
                <Icon className="w-5 h-5 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{a.type}</p>
                  <p className="text-xs opacity-80 mt-1">{a.rover} · {a.time}</p>
                </div>
                <button
                  onClick={() => {
                    setAcknowledged((prev) => {
                      const next = new Set(prev);
                      if (ack) next.delete(a.id); else next.add(a.id);
                      return next;
                    });
                  }}
                  className="shrink-0 text-xs px-2 py-1 rounded border border-current/30 hover:bg-current/10 flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3" /> {ack ? "Restaurar" : "Reconocer"}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Fin del listado · {filtered.length} eventos mostrados</span>
          <span>Actualizado en tiempo real</span>
        </div>
      </Panel>
    </div>
  );
}

function SeverityCard({
  label, value, accent, active, onClick,
}: {
  label: string; value: number;
  accent: "destructive" | "warning" | "primary";
  active: boolean; onClick: () => void;
}) {
  const map = {
    destructive: "border-destructive/40 bg-destructive/10 text-destructive",
    warning: "border-warning/40 bg-warning/10 text-warning",
    primary: "border-primary/40 bg-primary/10 text-primary",
  };
  return (
    <button onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${map[accent]} ${active ? "ring-2 ring-current/40" : ""}`}>
      <p className="text-[11px] uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </button>
  );
}