import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, Settings, Save } from "lucide-react";
import { Panel, PageHeader } from "@/components/dashboard/Panel";

export const Route = createFileRoute("/_dash/configuracion")({
  component: ConfigPage,
  head: () => ({ meta: [{ title: "Configuración · SmartWarehouse" }] }),
});

function ConfigPage() {
  const [notif, setNotif] = useState({ critical: true, warning: true, info: false });
  const [batteryMin, setBatteryMin] = useState(20);
  const [maxHours, setMaxHours] = useState(8);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        title="Configuración"
        description="Ajustes del sistema de monitoreo"
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title="Notificaciones" subtitle="Alertas que disparan toast" icon={Bell}>
          <div className="space-y-3">
            {(["critical", "warning", "info"] as const).map((k) => (
              <label
                key={k}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/30 cursor-pointer"
              >
                <span className="text-sm capitalize">
                  {k === "critical"
                    ? "Críticas"
                    : k === "warning"
                      ? "Advertencias"
                      : "Informativas"}
                </span>
                <input
                  type="checkbox"
                  checked={notif[k]}
                  onChange={(e) => setNotif({ ...notif, [k]: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
              </label>
            ))}
          </div>
        </Panel>

        <Panel title="Umbrales operativos" icon={Settings}>
          <div className="space-y-4">
            <Field label={`Batería mínima: ${batteryMin}%`}>
              <input
                type="range"
                min={5}
                max={50}
                value={batteryMin}
                onChange={(e) => setBatteryMin(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </Field>
            <Field label={`Horas máximas de trabajo: ${maxHours}h`}>
              <input
                type="range"
                min={4}
                max={16}
                value={maxHours}
                onChange={(e) => setMaxHours(Number(e.target.value))}
                className="w-full accent-primary"
              />
            </Field>
          </div>
        </Panel>
      </div>

      <div className="flex justify-end gap-3">
        {saved && <span className="text-xs text-primary self-center">✓ Cambios guardados</span>}
        <button
          onClick={save}
          className="px-4 py-2 text-sm rounded-md text-primary-foreground flex items-center gap-2"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          <Save className="w-4 h-4" /> Guardar cambios
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      {children}
    </div>
  );
}
