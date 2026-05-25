import type { Rover, RoverState } from "./dashboard-data";
import { initialRovers, orders as mockOrders, stock as mockStock } from "./dashboard-data";

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export type FrontendOrder = {
  id: string;
  product: string;
  qty: number;
  priority: string;
  state: string;
  rover: string;
};

export type FrontendProduct = {
  sku: string;
  name: string;
  zone: string;
  available: number;
  status: "ok" | "bajo" | "agotado";
};

// ─── Auth ──────────────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let loginInFlight: Promise<string> | null = null;

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@sw.com", password: "admin123" }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const body = (await res.json()) as { token: string };
  return body.token;
}

async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (!loginInFlight) {
    loginInFlight = login()
      .then((token) => { cachedToken = token; return token; })
      .finally(() => { loginInFlight = null; });
  }
  return loginInFlight;
}

async function apiFetch(path: string, retried = false): Promise<Response> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && !retried) {
    cachedToken = null;
    return apiFetch(path, true);
  }
  return res;
}

// ─── Backend types & mappers ───────────────────────────────────────────────────

export interface BackendVehicle {
  id: string;
  name: string;
  // backend sends lowercase: idle | busy | offline | error
  status: string;
  position: { x: number; y: number };
  battery: number;
  currentOrderId: string | null;
  lastSeenAt: string;
}

const statusToState: Record<string, RoverState> = {
  idle:    "activo",
  busy:    "activo",
  offline: "inactivo",
  error:   "detenido",
};

export function mapVehicle(v: BackendVehicle): Rover {
  return {
    id: v.id,
    name: v.name,
    state: statusToState[v.status] ?? "inactivo",
    battery: v.battery,
    hours: 0,
    order: v.currentOrderId ?? null,
    zone: "—",
    x: v.position?.x ?? 50,
    y: v.position?.y ?? 50,
    vx: 0,
    vy: 0,
  };
}

interface BackendOrderItem {
  productId: string;
  sku: string;
  quantity: number;
}

interface BackendOrder {
  id: string;
  status?: string;
  items?: BackendOrderItem[];
  assignedVehicleId?: string | null;
  // fallbacks por si el back cambia de nuevo
  product?: string;
  product_sku?: string;
  quantity?: number;
  priority?: string;
  vehicle_id?: string;
  rover?: string;
}

const orderStatusMap: Record<string, string> = {
  pending:     "en espera",
  in_progress: "en proceso",
  completed:   "completada",
  cancelled:   "cancelada",
};

function mapOrder(o: BackendOrder): FrontendOrder {
  const firstItem = o.items?.[0];
  const product = o.product ?? firstItem?.sku ?? o.product_sku ?? "—";
  const qty = firstItem?.quantity ?? o.quantity ?? 1;
  const rawState = o.status ?? "pending";
  const rover = o.assignedVehicleId ?? o.vehicle_id ?? o.rover ?? "—";
  return {
    id: o.id,
    product,
    qty,
    priority: o.priority ?? "media",
    state: orderStatusMap[rawState] ?? rawState,
    rover,
  };
}

interface BackendProduct {
  sku: string;
  name: string;
  stock?: {
    available?: number;
    reserved?: number;
    minimumStock?: number;   // camelCase en el nuevo backend
    minimum_stock?: number;  // fallback snake_case
  } | number;
  available?: number;
  location?: { zone?: string; line?: string; position?: string };
  active?: boolean;
}

function mapProduct(p: BackendProduct): FrontendProduct {
  const stockObj = typeof p.stock === "object" && p.stock !== null ? p.stock : null;
  const stockNum = typeof p.stock === "number" ? p.stock : null;

  const available =
    stockObj?.available ??
    stockNum ??
    p.available ??
    0;

  const minimum =
    stockObj?.minimumStock ??
    stockObj?.minimum_stock ??
    0;

  const zone = [p.location?.zone, p.location?.line].filter(Boolean).join("-");

  const status: FrontendProduct["status"] =
    available === 0 ? "agotado" : available <= minimum ? "bajo" : "ok";

  return { sku: p.sku, name: p.name, zone: zone || "—", available, status };
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function getVehicles(): Promise<Rover[]> {
  try {
    const res = await apiFetch("/vehicles");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const data = (Array.isArray(raw) ? raw : raw.vehicles ?? raw.content ?? []) as BackendVehicle[];
    return data.map(mapVehicle);
  } catch (err) {
    console.error("[api] getVehicles → mock:", err);
    return initialRovers.map((r) => ({ ...r }));
  }
}

export async function getOrders(status?: string): Promise<FrontendOrder[]> {
  try {
    const path = status ? `/orders?status=${encodeURIComponent(status)}` : "/orders";
    const res = await apiFetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const list = (Array.isArray(raw) ? raw : raw.orders ?? raw.content ?? []) as BackendOrder[];
    return list.map(mapOrder);
  } catch (err) {
    console.error("[api] getOrders → mock:", err);
    return mockOrders.map((o) => ({ ...o }));
  }
}

export async function getProducts(): Promise<FrontendProduct[]> {
  try {
    const res = await apiFetch("/products");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const list = (Array.isArray(raw) ? raw : raw.products ?? raw.content ?? []) as BackendProduct[];
    return list.map(mapProduct);
  } catch (err) {
    console.error("[api] getProducts → mock:", err);
    return mockStock.map((s) => ({ ...s, status: s.status as FrontendProduct["status"] }));
  }
}

export async function getWsUrl(): Promise<string> {
  const token = await getToken();
  if (!BASE_URL) {
    const proto = typeof location !== "undefined" && location.protocol === "https:" ? "wss:" : "ws:";
    const host  = typeof location !== "undefined" ? location.host : "localhost:8084";
    return `${proto}//${host}/ws/v1/vehicles?token=${token}`;
  }
  const wsBase = BASE_URL.replace(/^https/, "wss").replace(/^http/, "ws");
  return `${wsBase}/ws/v1/vehicles?token=${token}`;
}
