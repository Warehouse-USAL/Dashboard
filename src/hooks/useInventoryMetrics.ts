import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { getAllPositions, getOrders, getProducts } from "@/lib/api";
import { stock as mockStock } from "@/lib/dashboard-data";
import type { FrontendProduct } from "@/lib/api";
import { periodToBounds, withinBounds, type PeriodId } from "@/lib/dateRange";
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

  // Fetch broadly (all completed orders, uncapped by date) and bound by período
  // client-side below — consistent with how Órdenes/Vehículos do it, and avoids
  // needing a "to" bound in the API layer for custom ranges.
  const { data: completedOrdersRaw = [] } = useQuery({
    queryKey: ["orders-completed"],
    queryFn: () => getOrders("completed"),
    refetchInterval: 60_000,
  });

  // Bounded by período — this is what the table's "Dem. diaria"/"Cobertura"
  // columns and "Top rotación" reflect, since that's literally what the
  // picker is for (exploring demand over whatever window the user picks).
  const completedOrders = useMemo(
    () => completedOrdersRaw.filter((o) => withinBounds(o.completedAt ?? o.createdAt, bounds)),
    [completedOrdersRaw, bounds],
  );

  // Bounded by the fixed risk window instead — this is what decides
  // invStatus (riesgo/dead) and the risk KPIs (skusAtRisk/avgCoverage/
  // deadStockValue). Kept separate from `completedOrders` above so that
  // switching the page's período picker to a short/noisy window (e.g. 24h)
  // can't make a SKU's alert status flap — see useRiskWindow.
  const riskOrders = useMemo(
    () => completedOrdersRaw.filter((o) => withinBounds(o.completedAt ?? o.createdAt, riskBounds)),
    [completedOrdersRaw, riskBounds],
  );

  const { data: positions = [] } = useQuery({
    queryKey: ["warehouse-positions"],
    queryFn: getAllPositions,
    refetchInterval: 5 * 60_000,
    staleTime: 5 * 60_000,
  });

  return useMemo(() => {
    const now = Date.now();

    // Demand per SKU, bounded by the selected período — drives the returned
    // dailyDemand/coverageDays (table columns + Top rotación). Exploratory only.
    const demandMap = new Map<string, { totalQty: number; orderDays: Set<string> }>();
    completedOrders.forEach((order) => {
      const sku = order.product;
      if (!sku || sku === "—") return;
      const entry = demandMap.get(sku) ?? { totalQty: 0, orderDays: new Set<string>() };
      entry.totalQty += order.qty;
      // Track unique calendar days with orders to compute demand per active day
      const dayStr = (order.completedAt ?? order.createdAt ?? "").split("T")[0];
      if (dayStr) entry.orderDays.add(dayStr);
      demandMap.set(sku, entry);
    });

    // Same aggregation, but bounded by the fixed risk window — feeds
    // riskCoverageDays below, which is what actually decides invStatus.
    const riskDemandMap = new Map<string, { totalQty: number; orderDays: Set<string> }>();
    riskOrders.forEach((order) => {
      const sku = order.product;
      if (!sku || sku === "—") return;
      const entry = riskDemandMap.get(sku) ?? { totalQty: 0, orderDays: new Set<string>() };
      entry.totalQty += order.qty;
      const dayStr = (order.completedAt ?? order.createdAt ?? "").split("T")[0];
      if (dayStr) entry.orderDays.add(dayStr);
      riskDemandMap.set(sku, entry);
    });

    // Last-order date per SKU, from the FULL order history — NOT bounded by
    // período. "¿Cuándo se pidió por última vez?" is an absolute fact and must
    // not flip a SKU to "dead stock" just because the user narrowed the
    // demand-window picker to 24h (see #46 follow-up).
    const lastOrderMap = new Map<string, string>();
    completedOrdersRaw.forEach((order) => {
      const sku = order.product;
      if (!sku || sku === "—" || !order.completedAt) return;
      const current = lastOrderMap.get(sku);
      if (!current || order.completedAt > current) lastOrderMap.set(sku, order.completedAt);
    });

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
      const dailyDemand = demandInfo
        ? demandInfo.totalQty / Math.max(demandInfo.orderDays.size, 1)
        : 0;
      const coverageDays = dailyDemand > 0 ? p.available / dailyDemand : p.available > 0 ? 9999 : 0;

      const riskInfo = riskDemandMap.get(p.sku);
      const riskDailyDemand = riskInfo
        ? riskInfo.totalQty / Math.max(riskInfo.orderDays.size, 1)
        : 0;
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
  }, [
    products,
    completedOrders,
    riskOrders,
    completedOrdersRaw,
    positions,
    riskWindowDays,
    riskBounds,
  ]);
}
