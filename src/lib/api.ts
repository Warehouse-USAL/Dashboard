import type { Rover, RoverState } from "./dashboard-data";
import { initialRovers, orders as mockOrders, stock as mockStock } from "./dashboard-data";

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8090";

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
  const { token } = (await res.json()) as { token: string };
  return token;
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
  status: "IDLE" | "BUSY" | "OFFLINE" | "ERROR";
  position: { x: number; y: number };
  battery: number;
  current_order_id: string | null;
  last_seen_at: string;
}

const statusToState: Record<string, RoverState> = {
  IDLE: "activo",
  BUSY: "activo",
  OFFLINE: "inactivo",
  ERROR: "detenido",
};

export function mapVehicle(v: BackendVehicle): Rover {
  return {
    id: v.id,
    name: v.name,
    state: statusToState[v.status] ?? "inactivo",
    battery: v.battery,
    hours: 0,
    order: v.current_order_id,
    zone: "—",
    x: v.position?.x ?? 50,
    y: v.position?.y ?? 50,
    vx: 0,
    vy: 0,
  };
}

interface BackendOrder {
  id: string;
  product?: string;
  product_sku?: string;
  product_name?: string;
  quantity?: number;
  qty?: number;
  priority?: string;
  status?: string;
  state?: string;
  vehicle_id?: string;
  rover?: string;
}

const orderStatusMap: Record<string, string> = {
  pending: "en espera",
  in_progress: "en proceso",
  completed: "completada",
  cancelled: "cancelada",
};

function mapOrder(o: BackendOrder): FrontendOrder {
  const productParts = [o.product_sku, o.product_name].filter(Boolean);
  const product = o.product ?? (productParts.length ? productParts.join(" · ") : "—");
  const rawState = o.status ?? o.state ?? "pending";
  return {
    id: o.id,
    product,
    qty: o.quantity ?? o.qty ?? 1,
    priority: o.priority ?? "media",
    state: orderStatusMap[rawState] ?? rawState,
    rover: o.vehicle_id ?? o.rover ?? "—",
  };
}

interface BackendProduct {
  sku: string;
  name: string;
  // stock puede venir como objeto anidado { available, minimum_stock } o como número directo
  stock?: { available?: number; reserved?: number; minimum_stock?: number } | number;
  // available también puede estar en el nivel raíz
  available?: number;
  quantity?: number;
  minimum_stock?: number;
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
    p.quantity ??
    0;

  const minimum =
    stockObj?.minimum_stock ??
    p.minimum_stock ??
    0;

  const loc = p.location;
  const zone = [loc?.zone, loc?.line].filter(Boolean).join("-");

  console.log(`[api] mapProduct ${p.sku}: stock=${JSON.stringify(p.stock)} → available=${available}`);

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
    console.log("[api] GET /vehicles raw:", raw);
    const data = (Array.isArray(raw) ? raw : raw.vehicles ?? raw.content ?? []) as BackendVehicle[];
    return data.map(mapVehicle);
  } catch (err) {
    console.error("[api] getVehicles → fallback mock:", err);
    return initialRovers.map((r) => ({ ...r }));
  }
}

export async function getOrders(status?: string): Promise<FrontendOrder[]> {
  try {
    const path = status ? `/orders?status=${encodeURIComponent(status)}` : "/orders";
    const res = await apiFetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    console.log("[api] GET /orders raw:", raw);
    const list = (Array.isArray(raw) ? raw : raw.orders ?? raw.content ?? []) as BackendOrder[];
    return list.map(mapOrder);
  } catch (err) {
    console.error("[api] getOrders → fallback mock:", err);
    return mockOrders.map((o) => ({ ...o }));
  }
}

export async function getProducts(): Promise<FrontendProduct[]> {
  try {
    const res = await apiFetch("/products");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    console.log("[api] GET /products raw:", raw);
    const list = (Array.isArray(raw) ? raw : raw.products ?? raw.content ?? []) as BackendProduct[];
    return list.map(mapProduct);
  } catch (err) {
    console.error("[api] getProducts → fallback mock:", err);
    return mockStock.map((s) => ({ ...s, status: s.status as FrontendProduct["status"] }));
  }
}

export async function getWsUrl(): Promise<string> {
  const token = await getToken();
  if (!BASE_URL) {
    // proxy mode: same host as the page, just swap protocol
    const proto = typeof location !== "undefined" && location.protocol === "https:" ? "wss:" : "ws:";
    const host  = typeof location !== "undefined" ? location.host : "localhost:8084";
    return `${proto}//${host}/ws/v1/vehicles?token=${token}`;
  }
  const wsBase = BASE_URL.replace(/^https/, "wss").replace(/^http/, "ws");
  return `${wsBase}/ws/v1/vehicles?token=${token}`;
}
