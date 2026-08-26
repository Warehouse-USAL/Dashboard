import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, Settings, Save } from "lucide-react";
import { Panel, PageHeader } from "@/components/dashboard/Panel";
import { useRiskWindow, RISK_WINDOW_OPTIONS } from "@/hooks/useRiskWindow";

export const Route = createFileRoute("/_dash/configuracion")({
  component: ConfigPage,
  head: () => ({ meta: [{ title: "Configuración · SmartWarehouse" }] }),
});

function ConfigPage() {
  const [notif, setNotif] = useState({ critical: true, warning: true, info: false });
  const [batteryMin, setBatteryMin] = useState(20);
  const [maxHours, setMaxHours] = useState(8);
  const [saved, setSaved] = useState(false);
  const [riskWindowDays, setRiskWindowDays] = useRiskWindow();

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
            <Field label="Ventana de cálculo de riesgo de stock">
              <div className="flex items-center gap-2 flex-wrap">
                {RISK_WINDOW_OPTIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setRiskWindowDays(d)}
                    className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                      riskWindowDays === d
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary/60"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                Ventana de demanda usada para decidir "SKUs en riesgo", "Cobertura promedio" y "Dead
                stock" en Inventario. Se aplica al instante — no está atada al selector de período
                de esa página, que es solo para explorar datos.
              </p>
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
