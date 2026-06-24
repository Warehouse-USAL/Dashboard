import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAllPositions, getOrders, getProducts } from "@/lib/api";
import { stock as mockStock } from "@/lib/dashboard-data";
import type { FrontendProduct } from "@/lib/api";

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

export function useInventoryMetrics() {
  const from30d = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, []);

  const { data: products = MOCK_PRODUCTS_INIT } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
    refetchInterval: 10_000,
    initialData: MOCK_PRODUCTS_INIT,
  });

  const { data: completedOrders = [] } = useQuery({
    queryKey: ["orders-completed", from30d],
    queryFn: () => getOrders("completed", from30d),
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
    const sevenDaysMs = 7 * 86_400_000;

    // Aggregate demand and last order date per SKU from completed orders (last 30d)
    const skuMap = new Map<
      string,
      { totalQty: number; lastDate: string | null; orderDays: Set<string> }
    >();

    completedOrders.forEach((order) => {
      const sku = order.product;
      if (!sku || sku === "—") return;
      const entry = skuMap.get(sku) ?? {
        totalQty: 0,
        lastDate: null,
        orderDays: new Set<string>(),
      };
      entry.totalQty += order.qty;
      // Track unique calendar days with orders to compute demand per active day
      const dayStr = (order.completedAt ?? order.createdAt ?? "").split("T")[0];
      if (dayStr) entry.orderDays.add(dayStr);
      if (order.completedAt) {
        if (!entry.lastDate || order.completedAt > entry.lastDate)
          entry.lastDate = order.completedAt;
      }
      skuMap.set(sku, entry);
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

    const enriched: EnrichedProduct[] = products.map((p) => {
      const info = skuMap.get(p.sku);
      const dailyDemand = info ? info.totalQty / Math.max(info.orderDays.size, 1) : 0;
      const coverageDays = dailyDemand > 0 ? p.available / dailyDemand : p.available > 0 ? 9999 : 0;
      const stockValue = (p.available * p.priceCents) / 100;
      const reqNeto = Math.max(0, p.minimum - p.available);
      const lastOrderDate = info?.lastDate ?? null;
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

      let invStatus: InvStatus;
      if (p.available === 0) {
        invStatus = "quiebre";
      } else if (lastOrderTs === 0 || now - lastOrderTs > sevenDaysMs) {
        invStatus = coverageDays >= 90 ? "dead" : "disponible";
      } else if (coverageDays < 5) {
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
    const finiteCovers = enriched.filter((p) => p.dailyDemand > 0 && p.coverageDays < 9999);
    const avgCoverage = finiteCovers.length
      ? finiteCovers.reduce((a, p) => a + p.coverageDays, 0) / finiteCovers.length
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

    return { products: enriched, kpis, zoneOccupancy };
  }, [products, completedOrders, positions]);
}
