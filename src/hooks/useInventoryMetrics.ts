import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { getAllPositions, getProducts } from "@/lib/api";
import { stock as mockStock } from "@/lib/dashboard-data";
import type { FrontendProduct } from "@/lib/api";
import { periodToBounds, type PeriodId } from "@/lib/dateRange";
import { ordersWindow, queryEntity } from "@/lib/query-api";
import { useRiskWindow } from "@/hooks/useRiskWindow";

export type InvStatus = "disponible" | "riesgo" | "quiebre" | "dead";

export type EnrichedProduct = {
  sku: string;
  name: string;
  zone: string;
  positionDisplay: string;
  available: number;
  reserved: number;
  minimum: number;
  priceCents: number;
  currency: string;
  dailyDemand: number;
  /** Unidades totales pedidas en el período — no el promedio diario. */
  totalUnits: number;
  coverageDays: number;
  stockValue: number;
  reqNeto: number;
  lastOrderDate: string | null;
  lastOrderDaysAgo: number | null;
  invStatus: InvStatus;
};

export type InventoryKPIs = {
  totalValue: number;
  skusAtRisk: number;
  skusBreached: number;
  avgCoverage: number;
  deadStockValue: number;
};

const MOCK_PRODUCTS_INIT: FrontendProduct[] = mockStock.map((s) => ({
  id: s.sku,
  sku: s.sku,
  name: s.name,
  zone: s.zone,
  available: s.available,
  reserved: 0,
  minimum: 0,
  priceCents: 0,
  currency: "ARS",
  status: s.status as FrontendProduct["status"],
}));

/**
 * Fila de `/query/orders` agregado: cantidad completada de un SKU en un día
 * puntual dentro de la ventana pedida. Agrupar por (sku, día) en el servidor
 * replica exactamente "unidades totales / cantidad de días con al menos un
 * pedido" sin traer las órdenes crudas — reemplaza el `getOrders("completed")`
 * que sólo veía la primera página de 50 (ver PLAN-fix-tope-50-post-cola.md).
 */
type SkuDayDemand = { sku: string; day: string; qty: number };
type SkuLastOrder = { sku: string; last_order: string | null };

/** Junta filas (sku, día, qty) en total de unidades + cantidad de días
 *  distintos con pedido, por sku — la cuenta que antes hacía `demandMap`
 *  sobre órdenes crudas (un `Set<día>` por sku), ahora sobre filas ya
 *  agregadas en Mongo. */
function summarizeDemand(rows: SkuDayDemand[]): Map<string, { totalQty: number; days: number }> {
  const bySku = new Map<string, { totalQty: number; days: Set<string> }>();
  for (const r of rows) {
    const entry = bySku.get(r.sku) ?? { totalQty: 0, days: new Set<string>() };
    entry.totalQty += r.qty;
    entry.days.add(r.day);
    bySku.set(r.sku, entry);
  }
  return new Map([...bySku].map(([sku, v]) => [sku, { totalQty: v.totalQty, days: v.days.size }]));
}

/**
 * @param period Selected date-range filter (defaults to "30d" for callers that
 *   don't expose a picker). Drives `dailyDemand`/`coverageDays` on each product
 *   and "Top rotación" — the exploratory, period-scoped numbers. It does NOT
 *   drive `invStatus` (riesgo/quiebre/dead) or the risk-oriented KPIs
 *   (skusAtRisk/avgCoverage/deadStockValue): those use the separate, fixed
 *   "risk window" from useRiskWindow (config. en Configuración), on purpose —
 *   an alert that flips because someone picked "últimas 24h" to browse the
 *   table would be noise, not signal. See the comment further down where
 *   riskBounds/riskDemandMap are built.
 */
export function useInventoryMetrics(period: PeriodId = "30d", customRange?: DateRange) {
  const bounds = useMemo(() => periodToBounds(period, customRange), [period, customRange]);
  const [riskWindowDays] = useRiskWindow();
  const riskBounds = useMemo(() => {
    const now = Date.now();
    return { from: now - riskWindowDays * 86_400_000, to: now };
  }, [riskWindowDays]);

  const { data: products = MOCK_PRODUCTS_INIT } = useQuery({
    queryKey: ["products"],
    queryFn: () => getProducts(),
    refetchInterval: 10_000,
    initialData: MOCK_PRODUCTS_INIT,
  });

  // Demanda por SKU agregada en Mongo, agrupada por (sku, día) — una llamada
  // por ventana, en vez de traer órdenes crudas y sumarlas acá (ver
  // getOrders("completed") de antes, capado a 50 filas sin orden garantizado).
  const periodOrdersWindow = useMemo(() => ordersWindow(bounds), [bounds]);
  const riskOrdersWindow = useMemo(() => ordersWindow(riskBounds), [riskBounds]);
  // "Última orden" es un hecho absoluto y no debería moverse con el período
  // elegido (ver comentario más abajo en lastOrderMap) — se pide con la
  // ventana más ancha que el backend admite (92 días) en vez de la del picker
  // o la de riesgo. Congelada al montar el hook, igual que el resto de las
  // ventanas de este archivo (no se corre sola con el reloj).
  const lastOrderWindow = useMemo(
    () => ordersWindow({ from: Date.now() - 92 * 86_400_000, to: Date.now() }),
    [],
  );

  const demandQuery = (window: ReturnType<typeof ordersWindow>) => ({
    filters: [{ field: "status", op: "eq" as const, value: "COMPLETED" }, ...window.filters],
    unwind: "items",
    group_by: [
      { field: "items.sku", as: "sku" },
      { field: "completed_at", bucket: "day" as const, as: "day" },
    ],
    aggregates: [{ op: "sum" as const, field: "items.quantity", as: "qty" }],
    // Peor caso: 24 productos × 92 días = 2208 filas si TODOS vendieran TODOS
    // los días. En la práctica muy por debajo de eso (mismo margen que usa
    // useOrderStats.ts para su bucket diario).
    size: 1000,
  });

  const { data: periodDemand } = useQuery({
    queryKey: [
      "inventory-demand-period",
      periodOrdersWindow.from.toISOString(),
      periodOrdersWindow.to.toISOString(),
    ],
    queryFn: () => queryEntity<SkuDayDemand>("orders", demandQuery(periodOrdersWindow)),
    refetchInterval: 60_000,
  });

  const { data: riskDemand } = useQuery({
    queryKey: [
      "inventory-demand-risk",
      riskOrdersWindow.from.toISOString(),
      riskOrdersWindow.to.toISOString(),
    ],
    queryFn: () => queryEntity<SkuDayDemand>("orders", demandQuery(riskOrdersWindow)),
    refetchInterval: 60_000,
  });

  const { data: lastOrders } = useQuery({
    queryKey: [
      "inventory-last-order",
      lastOrderWindow.from.toISOString(),
      lastOrderWindow.to.toISOString(),
    ],
    queryFn: () =>
      queryEntity<SkuLastOrder>("orders", {
        filters: [{ field: "status", op: "eq", value: "COMPLETED" }, ...lastOrderWindow.filters],
        unwind: "items",
        group_by: [{ field: "items.sku", as: "sku" }],
        aggregates: [{ op: "max", field: "completed_at", as: "last_order" }],
        size: 1000,
      }),
    refetchInterval: 60_000,
  });

  const { data: positions = [] } = useQuery({
    queryKey: ["warehouse-positions"],
    queryFn: getAllPositions,
    refetchInterval: 5 * 60_000,
    staleTime: 5 * 60_000,
  });

  return useMemo(() => {
    const now = Date.now();

    // Demand per SKU, bounded by the selected período — drives the returned
    // dailyDemand/coverageDays (table columns + Top rotación). Exploratory
    // only. Ya viene agregado por Mongo (sku, día) — sólo hay que sumar los
    // días distintos, no recorrer órdenes crudas.
    const demandMap = summarizeDemand(periodDemand?.items ?? []);

    // Same aggregation, but bounded by the fixed risk window — feeds
    // riskCoverageDays below, which is what actually decides invStatus.
    const riskDemandMap = summarizeDemand(riskDemand?.items ?? []);

    // Last-order date per SKU, acotado a los últimos 92 días (el máximo que
    // el backend admite en una consulta agregada) en vez de "todo el
    // historial sin límite" como antes — decisión confirmada con el usuario:
    // un SKU sin pedidos en 92 días muestra "sin datos" en vez de arrastrar
    // una fecha vieja que disfraza mal el estado de dead stock.
    const lastOrderMap = new Map<string, string>();
    for (const row of lastOrders?.items ?? []) {
      if (row.last_order) lastOrderMap.set(row.sku, row.last_order);
    }

    // First position with current_stock > 0 per product_id
    const positionByProductId = new Map<
      string,
      { position_name: string; zone_code?: string; number_line?: number }
    >();
    positions.forEach((pos) => {
      if (!pos.product_id || pos.current_stock <= 0) return;
      if (!positionByProductId.has(pos.product_id)) {
        positionByProductId.set(pos.product_id, {
          position_name: pos.position_name,
          zone_code: pos.zone_code,
          number_line: pos.number_line,
        });
      }
    });

    // riskCoverageDays per SKU (fixed risk window) — used only to decide
    // invStatus/avgCoverage below, never returned on EnrichedProduct. The
    // table's own `coverageDays` (below) stays on the período picker.
    const riskCoverageBySku = new Map<
      string,
      { riskDailyDemand: number; riskCoverageDays: number }
    >();

    const enriched: EnrichedProduct[] = products.map((p) => {
      const demandInfo = demandMap.get(p.sku);
      const dailyDemand = demandInfo ? demandInfo.totalQty / Math.max(demandInfo.days, 1) : 0;
      const coverageDays = dailyDemand > 0 ? p.available / dailyDemand : p.available > 0 ? 9999 : 0;

      const riskInfo = riskDemandMap.get(p.sku);
      const riskDailyDemand = riskInfo ? riskInfo.totalQty / Math.max(riskInfo.days, 1) : 0;
      const riskCoverageDays =
        riskDailyDemand > 0 ? p.available / riskDailyDemand : p.available > 0 ? 9999 : 0;
      riskCoverageBySku.set(p.sku, { riskDailyDemand, riskCoverageDays });

      const stockValue = (p.available * p.priceCents) / 100;
      const reqNeto = Math.max(0, p.minimum - p.available);
      const lastOrderDate = lastOrderMap.get(p.sku) ?? null;
      const lastOrderTs = lastOrderDate ? new Date(lastOrderDate).getTime() : 0;
      const lastOrderDaysAgo = lastOrderDate ? (now - lastOrderTs) / 86_400_000 : null;

      const pos = positionByProductId.get(p.id);
      const positionDisplay = pos
        ? pos.zone_code
          ? `${pos.zone_code}-L${pos.number_line ?? "?"}-${pos.position_name}`
          : pos.position_name
        : p.zone || "—";
      // zone letter used for occupancy grouping
      const zone = pos?.zone_code ?? p.zone.split("-")[0] ?? "—";

      // Riesgo/dead/disponible decided off riskCoverageDays and riskBounds
      // (ventana de riesgo, config), NOT el período-scoped coverageDays de
      // arriba — ver doc comment de useInventoryMetrics. Quiebre stays a
      // pure stock check either way.
      let invStatus: InvStatus;
      if (p.available === 0) {
        invStatus = "quiebre";
      } else if (lastOrderTs === 0 || lastOrderTs < riskBounds.from) {
        invStatus = riskCoverageDays >= 90 ? "dead" : "disponible";
      } else if (riskCoverageDays < 5) {
        invStatus = "riesgo";
      } else {
        invStatus = "disponible";
      }

      return {
        sku: p.sku,
        name: p.name,
        zone,
        positionDisplay,
        available: p.available,
        reserved: p.reserved,
        minimum: p.minimum,
        priceCents: p.priceCents,
        currency: p.currency,
        dailyDemand,
        totalUnits: demandInfo?.totalQty ?? 0,
        coverageDays,
        stockValue,
        reqNeto,
        lastOrderDate,
        lastOrderDaysAgo,
        invStatus,
      };
    });

    const totalValue = enriched.reduce((a, p) => a + p.stockValue, 0);
    const skusAtRisk = enriched.filter((p) => p.invStatus === "riesgo").length;
    const skusBreached = enriched.filter((p) => p.invStatus === "quiebre").length;
    const deadStockValue = enriched
      .filter((p) => p.invStatus === "dead")
      .reduce((a, p) => a + p.stockValue, 0);
    // Aggregate coverage, same fixed risk window as invStatus above — kept
    // consistent with "SKUs en riesgo" rather than mixing in the período pick.
    const finiteRiskCovers = [...riskCoverageBySku.values()].filter(
      (r) => r.riskDailyDemand > 0 && r.riskCoverageDays < 9999,
    );
    const avgCoverage = finiteRiskCovers.length
      ? finiteRiskCovers.reduce((a, r) => a + r.riskCoverageDays, 0) / finiteRiskCovers.length
      : 0;

    const kpis: InventoryKPIs = {
      totalValue,
      skusAtRisk,
      skusBreached,
      avgCoverage,
      deadStockValue,
    };

    // Zone occupancy from real position data: Σ current_stock / Σ maximum_capacity per zone
    const zoneMap = new Map<string, { stock: number; capacity: number }>();
    positions.forEach((pos) => {
      if (!pos.zone_code) return;
      const entry = zoneMap.get(pos.zone_code) ?? { stock: 0, capacity: 0 };
      entry.stock += pos.current_stock;
      entry.capacity += pos.maximum_capacity ?? 0;
      zoneMap.set(pos.zone_code, entry);
    });
    const zoneOccupancy = Array.from(zoneMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([zone, { stock, capacity }]) => ({ zone, stock, capacity }));

    return { products: enriched, kpis, zoneOccupancy, riskWindowDays };
  }, [products, periodDemand, riskDemand, lastOrders, positions, riskWindowDays, riskBounds]);
}
