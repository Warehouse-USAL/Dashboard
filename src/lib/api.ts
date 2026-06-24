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
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  cancelReason?: string;
};

export type FrontendProduct = {
  id: string;
  sku: string;
  name: string;
  zone: string;
  available: number;
  reserved: number;
  minimum: number;
  priceCents: number;
  currency: string;
  status: "ok" | "bajo" | "agotado";
};

// ─── Auth ──────────────────────────────────────────────────────────────────────
// Each USER authenticates themselves — there is NO service credential baked into the
// build. The login screen calls login(email, password); we keep the returned JWT in
// sessionStorage (per-tab, gone when the tab closes). Nothing secret ships in the JS.

const TOKEN_KEY = "wh_token";
let cachedToken: string | null = null;

export function getStoredToken(): string | null {
  if (cachedToken) return cachedToken;
  if (typeof window !== "undefined") cachedToken = window.sessionStorage.getItem(TOKEN_KEY);
  return cachedToken;
}

export function setStoredToken(token: string): void {
  cachedToken = token;
  if (typeof window !== "undefined") window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  cachedToken = null;
  if (typeof window !== "undefined") window.sessionStorage.removeItem(TOKEN_KEY);
}

/** Called by the login screen with the user's own credentials. */
export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const body = (await res.json()) as { token: string };
  setStoredToken(body.token);
}

function redirectToLogin(): void {
  if (typeof window !== "undefined" && !window.location.pathname.endsWith("/login")) {
    window.location.href = "/dashboard/login";
  }
}

async function getToken(): Promise<string> {
  const token = getStoredToken();
  if (!token) {
    redirectToLogin();
    throw new Error("Not authenticated");
  }
  return token;
}

async function apiFetch(path: string): Promise<Response> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    clearStoredToken();
    redirectToLogin();
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
  idle: "activo",
  busy: "activo",
  offline: "inactivo",
  error: "detenido",
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
  timestamps?: { created_at?: string; started_at?: string; completed_at?: string };
  cancel_reason?: string | null;
}

const orderStatusMap: Record<string, string> = {
  pending: "en espera",
  in_progress: "en proceso",
  completed: "completada",
  cancelled: "cancelada",
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
    createdAt: o.timestamps?.created_at,
    startedAt: o.timestamps?.started_at,
    completedAt: o.timestamps?.completed_at,
    cancelReason: o.cancel_reason ?? undefined,
  };
}

interface BackendProduct {
  id?: string;
  sku: string;
  name: string;
  price?: { amount_cents?: number; currency?: string };
  stock?:
    | {
        available?: number;
        reserved?: number;
        minimumStock?: number;
        minimum_stock?: number;
        min?: number; // RFC field name
      }
    | number;
  available?: number;
  location?: {
    zone?: string;
    line?: string;
    position?: string;
    zone_code?: string;
    number_line?: number;
    position_name?: string;
  };
  active?: boolean;
  created_at?: string;
}

function mapProduct(p: BackendProduct): FrontendProduct {
  const stockObj = typeof p.stock === "object" && p.stock !== null ? p.stock : null;
  const stockNum = typeof p.stock === "number" ? p.stock : null;

  const available = stockObj?.available ?? stockNum ?? p.available ?? 0;
  const reserved = stockObj?.reserved ?? 0;
  const minimum = stockObj?.minimumStock ?? stockObj?.minimum_stock ?? stockObj?.min ?? 0;

  const priceCents = p.price?.amount_cents ?? 0;
  const currency = p.price?.currency ?? "ARS";

  const zone = p.location?.zone_code
    ? `${p.location.zone_code}-${p.location.number_line ?? "?"}`
    : [p.location?.zone, p.location?.line].filter(Boolean).join("-");

  const status: FrontendProduct["status"] =
    available === 0 ? "agotado" : available <= minimum ? "bajo" : "ok";

  return {
    id: p.id ?? p.sku,
    sku: p.sku,
    name: p.name,
    zone: zone || "—",
    available,
    reserved,
    minimum,
    priceCents,
    currency,
    status,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function getVehicles(): Promise<Rover[]> {
  try {
    const res = await apiFetch("/vehicles");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const data = (
      Array.isArray(raw) ? raw : (raw.vehicles ?? raw.content ?? [])
    ) as BackendVehicle[];
    return data.map(mapVehicle);
  } catch (err) {
    console.error("[api] getVehicles → mock:", err);
    return initialRovers.map((r) => ({ ...r }));
  }
}

export async function getOrders(status?: string, fromISO?: string): Promise<FrontendOrder[]> {
  try {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (fromISO) params.set("from", fromISO);
    const qs = params.toString();
    const path = qs ? `/orders?${qs}` : "/orders";
    const res = await apiFetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const list = (Array.isArray(raw) ? raw : (raw.orders ?? raw.content ?? [])) as BackendOrder[];
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
    const list = (
      Array.isArray(raw) ? raw : (raw.products ?? raw.content ?? [])
    ) as BackendProduct[];
    return list.map(mapProduct);
  } catch (err) {
    console.error("[api] getProducts → mock:", err);
    return mockStock.map((s) => ({
      id: s.sku,
      ...s,
      reserved: 0,
      minimum: 0,
      priceCents: 0,
      currency: "ARS",
      status: s.status as FrontendProduct["status"],
    }));
  }
}

// ─── Warehouse positions ───────────────────────────────────────────────────────

export interface WarehousePosition {
  id_position: string;
  id_line: string;
  id_zone: string;
  position_name: string;
  product_id: string | null;
  current_stock: number;
  maximum_capacity?: number;
  is_active?: boolean;
  // injected after fetch
  zone_code?: string;
  number_line?: number;
}

/**
 * Fetches all zones → lines → positions in parallel and returns a flat list.
 * Falls back to [] on any error so callers degrade gracefully.
 */
export async function getAllPositions(): Promise<WarehousePosition[]> {
  try {
    const zonesRes = await apiFetch("/warehouse/zones");
    if (!zonesRes.ok) throw new Error(`zones: ${zonesRes.status}`);
    const zonesData = (await zonesRes.json()) as {
      zones?: Array<{ id_zone: string; zone_code: string }>;
    };
    const zones = zonesData.zones ?? [];

    const linesPerZone = await Promise.all(
      zones.map(async (z) => {
        const r = await apiFetch(`/warehouse/zones/${z.id_zone}/lines`);
        if (!r.ok) return [];
        const d = (await r.json()) as {
          lines?: Array<{ id_line: string; number_line: number }>;
        };
        return (d.lines ?? []).map((l) => ({ ...l, zone_code: z.zone_code }));
      }),
    );
    const lines = linesPerZone.flat();

    const posPerLine = await Promise.all(
      lines.map(async (l) => {
        const r = await apiFetch(`/warehouse/lines/${l.id_line}/positions`);
        if (!r.ok) return [];
        const d = (await r.json()) as { positions?: WarehousePosition[] };
        return (d.positions ?? []).map((p) => ({
          ...p,
          zone_code: l.zone_code,
          number_line: l.number_line,
        }));
      }),
    );
    return posPerLine.flat();
  } catch (err) {
    console.error("[api] getAllPositions → []:", err);
    return [];
  }
}

export async function getWsUrl(path: string = "/ws/v1/vehicles"): Promise<string> {
  const token = await getToken();
  if (!BASE_URL) {
    const proto =
      typeof location !== "undefined" && location.protocol === "https:" ? "wss:" : "ws:";
    const host = typeof location !== "undefined" ? location.host : "localhost:8084";
    return `${proto}//${host}${path}?token=${token}`;
  }
  const wsBase = BASE_URL.replace(/^https/, "wss").replace(/^http/, "ws");
  return `${wsBase}${path}?token=${token}`;
}
