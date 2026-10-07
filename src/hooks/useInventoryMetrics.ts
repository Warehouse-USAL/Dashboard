import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { getAllPositions, getProducts } from "@/lib/api";
import { stock as mockStock } from "@/lib/dashboard-data";
import type { FrontendProduct, FrontendRestock } from "@/lib/api";
import { periodToBounds, type PeriodId } from "@/lib/dateRange";
import { ordersWindow, queryEntity } from "@/lib/query-api";

/**
 * Ventana de demanda larga del cron de reposición (`RESTOCK_LONG_DAYS` del
 * servicio `restock-cron` del backend, default 60). Dead stock se mide sobre
 * esta misma ventana, así que "sin demanda" significa lo mismo acá que para el
 * cron (demanda de largo plazo = 0).
 *
 * No es configurable: el backend no expone los parámetros con los que corrió el
 * cron, así que si alguien cambia `RESTOCK_LONG_DAYS` hay que actualizar esta
 * constante a mano. Pendiente pedirle que guarde `params_used` en
 * `product.restock`.
 */
export const RESTOCK_LONG_DAYS = 60;

export type EnrichedProduct = {
  sku: string;
  name: string;
  zone: string;
  positionDisplay: string;
  available: number;
  reserved: number;
  /** Stock en el depósito (`stock.physical`). Sólo baja al completarse una orden. */
  physical: number;
  minimum: number;
  priceCents: number;
  currency: string;
  /** Estado único del producto, ya resuelto en `mapProduct` (api.ts). Sólo sirve
   *  para el badge de la fila: "agotado" tiene prioridad sobre "a_reponer". Los
   *  conteos y filtros usan `isDepleted`/`needsRestock`, que pueden ser ciertos a
   *  la vez. */
  status: FrontendProduct["status"];
  /** Sin stock disponible (`available <= 0`). */
  isDepleted: boolean;
  /** El cron de reposición recomienda reponer (`restock.shouldRestock`). */
  needsRestock: boolean;
  /** Cantidad que sugiere el cron de reposición. `null` si el producto no tiene
   *  recomendación todavía (cron sin correr o producto desactivado). */
  suggestedQuantity: number | null;
  /** Cuándo calculó el cron esa recomendación. Es una foto diaria, no un dato en vivo. */
  restockCalculatedAt: string | null;
  /** Recomendación completa (punto de reposición, stock objetivo, posición), para
   *  explicar de dónde sale `suggestedQuantity`. `null` si no hay recomendación. */
  restock: FrontendRestock | null;
  /** Acotada al período elegido (picker de "Top rotación") — sólo para ese
   *  panel y para "Top SKU"/"Top SKUs" de Home. */
  dailyDemand: number;
  /** Unidades totales pedidas en el período — no el promedio diario. */
  totalUnits: number;
  /** Acotada al período — ver dailyDemand. */
  coverageDays: number;
  // Pendiente: las columnas "Dem. diaria"/"Cobertura" de la tabla vuelven cuando
  // `product.restock` exponga `blended_demand` (la demanda combinada del cron).
  // Antes salían de la Ventana de riesgo configurable, que ya no existe.
  // riskDailyDemand: number;
  // riskCoverageDays: number;
  /** Stock físico × precio: lo reservado sigue siendo capital inmovilizado. */
  stockValue: number;
  lastOrderDate: string | null;
  lastOrderDaysAgo: number | null;
};

export type InventoryKPIs = {
  totalValue: number;
  /** Productos que el cron recomienda reponer (`needsRestock`), estén o no agotados. */
  skusToRestock: number;
  /** Productos sin stock disponible (`isDepleted`), los repongan o no. Se superpone con `skusToRestock`. */
  skusDepleted: number;
  deadStockValue: number;
  deadStockCount: number;
  // Pendiente: vuelve con `blended_demand` — ver EnrichedProduct.
  // avgCoverage: number;
};

const MOCK_PRODUCTS_INIT: FrontendProduct[] = mockStock.map((s) => ({
  id: s.sku,
  sku: s.sku,
  name: s.name,
  zone: s.zone,
  available: s.available,
  reserved: 0,
  physical: s.available,
  minimum: 0,
  priceCents: 0,
  currency: "ARS",
  restock: null,
  // Los mocks de dashboard-data siguen usando el vocabulario viejo ("bajo").
  status: s.status === "bajo" ? "a_reponer" : (s.status as FrontendProduct["status"]),
}));

/**
 * Fila de `/query/orders` agregado: unidades completadas de un SKU dentro de
 * la ventana pedida — reemplaza el `getOrders("completed")` que sólo veía la
 * primera página de 50 (ver PLAN-fix-tope-50-post-cola.md).
 */
type SkuDemand = { sku: string; qty: number };
type SkuLastOrder = { sku: string; last_order: string | null };

/**
 * "Unidades por día" se calcula sobre el TOTAL de días de la ventana, no sobre
 * los días en los que hubo pedido. Dividir sólo por días activos infla la
 * demanda de cualquier SKU que no se vende todos los días (que es casi
 * todos) — 35 unidades en 90 días repartidas en 7 días activos daban "5 u/d"
 * en vez de los 0.4 u/d reales, y esa cifra inflada subestimaba "Cobertura"
 * (días de stock restantes) y podía marcar como "En riesgo" un SKU que en
 * realidad no lo estaba. Decisión confirmada con el usuario.
 */
function dailyRate(totalQty: number, windowDays: number): number {
  return windowDays > 0 ? totalQty / windowDays : 0;
}

/**
 * @param period Selected date-range filter (defaults to "30d" for callers that
 *   don't expose a picker). Drives `dailyDemand`/`coverageDays` on each product
 *   and "Top rotación" — the exploratory, period-scoped numbers. It does NOT
 *   drive `status` (viene de `product.restock`) ni el KPI de dead stock, que
 *   usa la ventana fija del cron (RESTOCK_LONG_DAYS): una alerta que cambia
 *   porque alguien eligió "últimas 24h" para explorar la tabla sería ruido.
 */
export function useInventoryMetrics(period: PeriodId = "30d", customRange?: DateRange) {
  const bounds = useMemo(() => periodToBounds(period, customRange), [period, customRange]);

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
  // Ventana de dead stock: la misma que usa el cron para su demanda de largo
  // plazo. Congelada al montar, como el resto de las ventanas de este archivo.
  const deadStockWindow = useMemo(
    () =>
      ordersWindow({ from: Date.now() - RESTOCK_LONG_DAYS * 86_400_000, to: Date.now() }),
    [],
  );
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
    group_by: [{ field: "items.sku", as: "sku" }],
    aggregates: [{ op: "sum" as const, field: "items.quantity", as: "qty" }],
    // Una fila por SKU con pedidos en la ventana — con 24 productos hoy sobra
    // por mucho margen incluso si el catálogo crece bastante.
    size: 200,
  });

  const { data: periodDemand } = useQuery({
    queryKey: [
      "inventory-demand-period",
      periodOrdersWindow.from.toISOString(),
      periodOrdersWindow.to.toISOString(),
    ],
    queryFn: () => queryEntity<SkuDemand>("orders", demandQuery(periodOrdersWindow)),
    refetchInterval: 60_000,
  });

  // Demanda con el criterio del cron (RFC_Metricas_Calculadas.md §4.2): unidades
  // de órdenes NO canceladas, contadas por fecha de creación. Difiere a propósito
  // de `demandQuery` (sólo COMPLETED), que es la demanda exploratoria del período.
  const { data: deadStockDemand } = useQuery({
    queryKey: [
      "inventory-demand-restock-window",
      deadStockWindow.from.toISOString(),
      deadStockWindow.to.toISOString(),
    ],
    queryFn: () =>
      queryEntity<SkuDemand>("orders", {
        filters: [{ field: "status", op: "ne", value: "CANCELLED" }, ...deadStockWindow.filters],
        unwind: "items",
        group_by: [{ field: "items.sku", as: "sku" }],
        aggregates: [{ op: "sum", field: "items.quantity", as: "qty" }],
        size: 200,
      }),
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
    // only. Ya viene sumado por Mongo (sólo agrupado por sku) — dailyRate()
    // divide por el total de días de la ventana, no por días activos.
    const demandMap = new Map((periodDemand?.items ?? []).map((r) => [r.sku, r.qty]));

    // Unidades por SKU en la ventana del cron — decide dead stock más abajo.
    const deadStockDemandMap = new Map((deadStockDemand?.items ?? []).map((r) => [r.sku, r.qty]));

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

    // Pendiente (vuelve con `blended_demand`): cobertura por SKU sobre la ventana
    // de riesgo configurable, que alimentaba las columnas "Dem. diaria"/"Cobertura"
    // y el KPI "Cobertura promedio".
    // const riskCoverageBySku = new Map<
    //   string,
    //   { riskDailyDemand: number; riskCoverageDays: number }
    // >();

    const enriched: EnrichedProduct[] = products.map((p) => {
      const totalUnits = demandMap.get(p.sku) ?? 0;
      const dailyDemand = dailyRate(totalUnits, periodOrdersWindow.days);
      const coverageDays = dailyDemand > 0 ? p.available / dailyDemand : p.available > 0 ? 9999 : 0;

      // const riskDailyDemand = dailyRate(riskDemandMap.get(p.sku) ?? 0, riskOrdersWindow.days);
      // const riskCoverageDays =
      //   riskDailyDemand > 0 ? p.available / riskDailyDemand : p.available > 0 ? 9999 : 0;
      // riskCoverageBySku.set(p.sku, { riskDailyDemand, riskCoverageDays });

      const stockValue = (p.physical * p.priceCents) / 100;
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

      return {
        sku: p.sku,
        name: p.name,
        zone,
        positionDisplay,
        available: p.available,
        reserved: p.reserved,
        physical: p.physical,
        minimum: p.minimum,
        priceCents: p.priceCents,
        currency: p.currency,
        status: p.status,
        isDepleted: p.available <= 0,
        needsRestock: p.restock?.shouldRestock ?? false,
        suggestedQuantity: p.restock?.suggestedQuantity ?? null,
        restockCalculatedAt: p.restock?.calculatedAt ?? null,
        restock: p.restock,
        dailyDemand,
        totalUnits,
        coverageDays,
        stockValue,
        lastOrderDate,
        lastOrderDaysAgo,
      };
    });

    // Dead stock: hay stock físico y ningún pedido no cancelado en la ventana del
    // cron. Es sólo un KPI — no marca filas. Mientras la consulta no respondió no
    // se puede afirmar que no hay demanda, así que no se cuenta ninguno (si no,
    // todo el catálogo aparecería como dead stock hasta que lleguen los datos).
    const deadStock = deadStockDemand
      ? enriched.filter((p) => p.physical > 0 && (deadStockDemandMap.get(p.sku) ?? 0) <= 0)
      : [];

    const totalValue = enriched.reduce((a, p) => a + p.stockValue, 0);
    // Se cuentan los dos hechos por separado, no por `status`: un producto agotado
    // que además hay que reponer cuenta en los dos (y siempre coincide con el cron).
    const skusToRestock = enriched.filter((p) => p.needsRestock).length;
    const skusDepleted = enriched.filter((p) => p.isDepleted).length;
    const deadStockValue = deadStock.reduce((a, p) => a + p.stockValue, 0);
    // Pendiente (vuelve con `blended_demand`): promedio de cobertura por SKU.
    // const finiteRiskCovers = [...riskCoverageBySku.values()].filter(
    //   (r) => r.riskDailyDemand > 0 && r.riskCoverageDays < 9999,
    // );
    // const avgCoverage = finiteRiskCovers.length
    //   ? finiteRiskCovers.reduce((a, r) => a + r.riskCoverageDays, 0) / finiteRiskCovers.length
    //   : 0;

    const kpis: InventoryKPIs = {
      totalValue,
      skusToRestock,
      skusDepleted,
      deadStockValue,
      deadStockCount: deadStock.length,
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

    return { products: enriched, kpis, zoneOccupancy, deadStockDays: RESTOCK_LONG_DAYS };
  }, [products, periodDemand, deadStockDemand, lastOrders, positions, periodOrdersWindow.days]);
}
