export type RoverState = "activo" | "inactivo" | "detenido" | "cargando";

export interface Rover {
  id: string;
  name: string;
  state: RoverState;
  battery: number;
  hours: number;
  order: string | null;
  zone: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export const initialRovers: Rover[] = [
  { id: "R-01", name: "Rover Alpha", state: "activo", battery: 82, hours: 4.2, order: "OR-12504", zone: "Pasillo 1", x: 25, y: 32, vx: 0.9, vy: 0 },
  { id: "R-02", name: "Rover Bravo", state: "activo", battery: 64, hours: 6.1, order: "OR-12508", zone: "Pasillo 2", x: 70, y: 60, vx: -0.9, vy: 0 },
  { id: "R-03", name: "Rover Charlie", state: "cargando", battery: 18, hours: 8.0, order: null, zone: "Carga", x: 50, y: 90, vx: 0, vy: 0 },
];

export const alerts = [
  { id: 1, hu: "HU#7", type: "Batería baja", rover: "R-03", level: "warning", time: "hace 2 min", icon: "battery-low" },
  { id: 2, hu: "HU#12", type: "Rover detenido > 30s", rover: "R-02", level: "critical", time: "hace 4 min", icon: "shield-alert" },
  { id: 4, hu: "HU#8", type: "Proximidad de rovers", rover: "R-01 ↔ R-02", level: "info", time: "hace 18 min", icon: "radio" },
  { id: 5, hu: "HU#10", type: "Producto caído detectado", rover: "R-02", level: "warning", time: "hace 25 min", icon: "alert-triangle" },
  { id: 7, hu: "HU#13", type: "Colisión de rover", rover: "R-01 ↔ R-02", level: "critical", time: "hace 47 min", icon: "alert-triangle" },
] as const;

export const orders = [
  { id: "OR-12504", product: "SKU-A102 · Caja 24u", qty: 3, priority: "alta", state: "en proceso", rover: "R-01" },
  { id: "OR-12508", product: "SKU-B441 · Pallet", qty: 1, priority: "alta", state: "en proceso", rover: "R-02" },
  { id: "OR-12511", product: "SKU-C019 · Caja 12u", qty: 5, priority: "media", state: "en espera", rover: "—" },
  { id: "OR-12512", product: "SKU-D227 · Bulto", qty: 2, priority: "baja", state: "en espera", rover: "—" },
  { id: "OR-12515", product: "SKU-A102 · Caja 24u", qty: 4, priority: "media", state: "en espera", rover: "—" },
  { id: "OR-12517", product: "SKU-E308 · Pallet", qty: 1, priority: "alta", state: "en espera", rover: "—" },
  { id: "OR-12519", product: "SKU-B441 · Pallet", qty: 2, priority: "baja", state: "en espera", rover: "—" },
];

export const stock = [
  { sku: "SKU-A102", name: "Caja estándar 24u", zone: "A-3", available: 142, status: "ok" },
  { sku: "SKU-B441", name: "Pallet industrial", zone: "B-1", available: 28, status: "ok" },
  { sku: "SKU-C019", name: "Caja 12u liviana", zone: "C-2", available: 9, status: "bajo" },
  { sku: "SKU-D227", name: "Bulto reforzado", zone: "D-4", available: 56, status: "ok" },
  { sku: "SKU-E308", name: "Pallet refrigerado", zone: "E-1", available: 0, status: "agotado" },
];

export const throughput = [
  { h: "08", ordenes: 12, tiempo: 4.1 },
  { h: "09", ordenes: 18, tiempo: 3.8 },
  { h: "10", ordenes: 22, tiempo: 3.5 },
  { h: "11", ordenes: 27, tiempo: 3.2 },
  { h: "12", ordenes: 19, tiempo: 3.9 },
  { h: "13", ordenes: 24, tiempo: 3.4 },
  { h: "14", ordenes: 31, tiempo: 3.0 },
  { h: "15", ordenes: 28, tiempo: 3.3 },
];

export const utilization = [
  { name: "Activos", value: 2, color: "oklch(0.78 0.18 180)" },
  { name: "Cargando", value: 1, color: "oklch(0.8 0.18 80)" },
  { name: "Detenidos", value: 0, color: "oklch(0.65 0.24 27)" },
];

export const stateStyles: Record<RoverState, string> = {
  activo: "bg-primary/15 text-primary border-primary/30",
  inactivo: "bg-muted text-muted-foreground border-border",
  detenido: "bg-destructive/15 text-destructive border-destructive/30",
  cargando: "bg-warning/15 text-warning border-warning/30",
};

export function batteryTone(pct: number) {
  if (pct < 25) return { label: "bajo", color: "text-destructive", bar: "bg-destructive" };
  if (pct < 60) return { label: "normal", color: "text-warning", bar: "bg-warning" };
  return { label: "óptimo", color: "text-primary", bar: "bg-primary" };
}

export function alertTone(level: string) {
  if (level === "critical") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (level === "warning") return "border-warning/40 bg-warning/10 text-warning";
  return "border-primary/30 bg-primary/10 text-primary";
}

import { useEffect, useState } from "react";

/** Live rovers store, shared singleton + subscribers. */
let _rovers: Rover[] = initialRovers.map((r) => ({ ...r }));
const _subs = new Set<() => void>();
let _started = false;

function startLoop() {
  if (_started || typeof window === "undefined") return;
  _started = true;
  setInterval(() => {
    _rovers = _rovers.map((r) => {
      if (r.state !== "activo") return r;
      let { x, y, vx, vy } = r;
      x += vx;
      y += vy;
      // bounce within almacén corridor (x: 22-78)
      if (x <= 22) { x = 22; vx = Math.abs(vx); }
      if (x >= 96) { x = 96; vx = -Math.abs(vx); }
      if (y <= 6) { y = 6; vy = Math.abs(vy); }
      if (y >= 94) { y = 94; vy = -Math.abs(vy); }
      return {
        ...r,
        x, y, vx, vy,
        battery: Math.max(5, r.battery - 0.05),
      };
    });
    _subs.forEach((s) => s());
  }, 120);
}

export function useLiveRovers() {
  const [, force] = useState(0);
  useEffect(() => {
    startLoop();
    const cb = () => force((n) => n + 1);
    _subs.add(cb);
    return () => {
      _subs.delete(cb);
    };
  }, []);
  return _rovers;
}