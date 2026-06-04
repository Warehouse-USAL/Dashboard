import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Map as MapIcon, Truck, Maximize2, Pause, Play } from "lucide-react";
import { Panel, PageHeader } from "@/components/dashboard/Panel";
import { batteryTone, stateStyles, type Rover, type RoverState } from "@/lib/dashboard-data";
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

function WarehouseMap({
  rovers, onSelect, selected, paused,
}: {
  rovers: Rover[];
  onSelect: (id: string) => void;
  selected: string | null;
  paused: boolean;
}) {
  const zones = [
    { x: 2, y: 4, w: 16, h: 44, label: "Picking" },
    { x: 2, y: 52, w: 16, h: 44, label: "Despacho" },
    { x: 20, y: 4, w: 78, h: 74, label: "Almacén" },
    { x: 20, y: 82, w: 78, h: 14, label: "Carga" },
  ];
  const aisles = [
    { y: 32, label: "Pasillo 1" },
    { y: 60, label: "Pasillo 2" },
  ];
  const stateDot: Record<RoverState, string> = {
    activo:   "bg-primary ring-2 ring-primary/40",
    cargando: "bg-warning ring-2 ring-warning/30",
    detenido: "bg-destructive ring-2 ring-destructive/30",
    inactivo: "bg-muted-foreground",
  };
  return (
    <div className="relative w-full aspect-[16/9] rounded-lg border border-border bg-secondary overflow-hidden">
      <div className="absolute inset-0" style={{
        backgroundImage:
          "linear-gradient(oklch(0.78 0.015 260) 1px, transparent 1px), linear-gradient(90deg, oklch(0.78 0.015 260) 1px, transparent 1px)",
        backgroundSize: "5% 5%",
      }} />
      {zones.map((z) => (
        <div key={z.label} className="absolute border-2 border-foreground/25 rounded bg-card/80"
          style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}>
          <span className="absolute top-1 left-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
            {z.label}
          </span>
        </div>
      ))}
      {aisles.map((a) => (
        <div key={a.label}
          className="absolute border-y-2 border-dashed border-info/70 bg-info/10"
          style={{ left: "20%", top: `${a.y - 4}%`, width: "78%", height: "8%" }}>
          <span className="absolute -top-3 left-2 text-[10px] font-semibold uppercase tracking-wider text-info">
            {a.label}
          </span>
        </div>
      ))}
      {rovers.map((r) => (
        <button
          key={r.id}
          onClick={() => onSelect(r.id)}
          className={`absolute -translate-x-1/2 -translate-y-1/2 ${paused ? "" : "transition-[left,top] duration-150 ease-linear"} ${selected === r.id ? "scale-150" : ""}`}
          style={{ left: `${r.x}%`, top: `${r.y}%` }}
        >
          <div className="relative">
            <div className={`w-3 h-3 rounded-full ${stateDot[r.state]}`} />
            {r.state === "activo" && <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />}
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-mono text-foreground/80 whitespace-nowrap">
              {r.id}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
