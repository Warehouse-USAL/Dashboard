import { type Rover, type RoverState } from "@/lib/dashboard-data";

export function WarehouseMap({
  rovers,
  onSelect,
  selected,
  paused = false,
}: {
  rovers: Rover[];
  onSelect?: (id: string) => void;
  selected?: string | null;
  paused?: boolean;
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
    busy: "bg-primary ring-2 ring-primary/40",
    idle: "bg-warning ring-2 ring-warning/30",
    error: "bg-destructive ring-2 ring-destructive/30",
    offline: "bg-muted-foreground",
  };
  return (
    <div className="relative w-full aspect-[16/9] rounded-lg border border-border bg-secondary overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.78 0.015 260) 1px, transparent 1px), linear-gradient(90deg, oklch(0.78 0.015 260) 1px, transparent 1px)",
          backgroundSize: "5% 5%",
        }}
      />
      {zones.map((z) => (
        <div
          key={z.label}
          className="absolute border-2 border-foreground/25 rounded bg-card/80"
          style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }}
        >
          <span className="absolute top-1 left-2 text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
            {z.label}
          </span>
        </div>
      ))}
      {aisles.map((a) => (
        <div
          key={a.label}
          className="absolute border-y-2 border-dashed border-info/70 bg-info/10"
          style={{ left: "20%", top: `${a.y - 4}%`, width: "78%", height: "8%" }}
        >
          <span className="absolute -top-3 left-2 text-[10px] font-semibold uppercase tracking-wider text-info">
            {a.label}
          </span>
        </div>
      ))}
      {rovers.map((r) => {
        const inner = (
          <div className="relative">
            <div className={`w-3 h-3 rounded-full ${stateDot[r.state]}`} />
            {r.state === "busy" && (
              <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
            )}
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[9px] font-mono text-foreground/80 whitespace-nowrap">
              {r.name}
            </span>
          </div>
        );
        const cls = `absolute -translate-x-1/2 -translate-y-1/2 ${
          paused ? "" : "transition-[left,top] duration-150 ease-linear"
        } ${selected === r.id ? "scale-150" : ""}`;
        const style = { left: `${r.x}%`, top: `${r.y}%` };
        return onSelect ? (
          <button key={r.id} onClick={() => onSelect(r.id)} className={cls} style={style}>
            {inner}
          </button>
        ) : (
          <div key={r.id} className={cls} style={style}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
