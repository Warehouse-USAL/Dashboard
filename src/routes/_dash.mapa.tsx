import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Map as MapIcon, Truck, Maximize2, Pause, Play } from "lucide-react";
import { Panel, PageHeader } from "@/components/dashboard/Panel";
import { WarehouseMap } from "@/components/dashboard/WarehouseMap";
import { batteryTone, stateStyles } from "@/lib/dashboard-data";
import { useVehicles } from "@/hooks/useVehicles";
import { useVehicleWebSocket } from "@/hooks/useVehicleWebSocket";

export const Route = createFileRoute("/_dash/mapa")({
  component: MapaPage,
  head: () => ({ meta: [{ title: "Mapa en vivo · SmartWarehouse" }] }),
});

function MapaPage() {
  const { data: rovers } = useVehicles();
  useVehicleWebSocket();
  const [selected, setSelected] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MapIcon}
        title="Mapa del Warehouse"
        description="Posiciones en tiempo real"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setPaused((p) => !p)}
              className="px-3 py-1.5 text-xs rounded-md border border-border bg-secondary/50 hover:bg-secondary flex items-center gap-1.5"
            >
              {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              {paused ? "Reanudar" : "Pausar"}
            </button>
            <button className="px-3 py-1.5 text-xs rounded-md border border-border bg-secondary/50 hover:bg-secondary flex items-center gap-1.5">
              <Maximize2 className="w-3 h-3" /> Pantalla completa
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <Panel title="Layout 2D" subtitle="Zonas · Pasillos · Rovers" icon={MapIcon} className="xl:col-span-3">
          <WarehouseMap rovers={rovers} onSelect={setSelected} selected={selected} paused={paused} />
          <div className="flex flex-wrap gap-3 mt-4 text-xs">
            <Legend color="bg-primary" label="Activo" />
            <Legend color="bg-warning" label="Cargando" />
            <Legend color="bg-destructive" label="Detenido" />
            <Legend color="bg-muted-foreground" label="Inactivo" />
          </div>
        </Panel>

        <Panel title="Detalle" subtitle={selected ?? "Seleccioná un rover"} icon={Truck}>
          {(() => {
            const r = rovers.find((x) => x.id === selected) ?? rovers[0];
            const bt = batteryTone(r.battery);
            return (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Rover</p>
                  <p className="font-bold">{r.id} — {r.name}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Estado</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border ${stateStyles[r.state]}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" /> {r.state}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Zona actual</p>
                  <p>{r.zone}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Posición</p>
                  <p className="font-mono text-xs">x: {r.x.toFixed(1)} · y: {r.y.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Batería</p>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden mt-1">
                    <div className={`h-full ${bt.bar}`} style={{ width: `${r.battery}%` }} />
                  </div>
                  <p className={`text-xs mt-1 ${bt.color}`}>{Math.round(r.battery)}% · {bt.label}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Orden actual</p>
                  <p>{r.order ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Horas</p>
                  <p>{r.hours.toFixed(1)} h</p>
                </div>
              </div>
            );
          })()}
        </Panel>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={`w-2 h-2 rounded-full ${color}`} /> {label}
    </span>
  );
}

