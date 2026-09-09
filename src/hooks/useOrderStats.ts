import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { mapOrderPriority } from "@/lib/api";
import { periodToBounds, type PeriodId } from "@/lib/dateRange";
import { ordersWindow, queryEntity } from "@/lib/query-api";
import { worstSource, type DataSource } from "@/lib/data-source";

export type OrderState = "pending" | "in_progress" | "completed" | "cancelled";
export type Priority = "urgente" | "alta" | "media" | "baja";

export type HourlyPoint = { bucket: string; label: string; orders: number };

/**
 * KPIs, distribución y el gráfico "por hora" de la página de Órdenes, todos
 * server-side vía `/query/orders` en modo agregado.
 *
 * Reemplaza dos cosas rotas a la vez:
 *
 * - El tope de 50 filas de `GET /orders`: acá se cuenta en Mongo sobre las 729
 *   órdenes reales, no sobre las 50 que llega a cargar el navegador.
 * - La ventana fija de 24h que tenían "Completadas/hora", "Cycle time" y "SLA":
 *   ahora respetan el período elegido, igual que el resto de la página.
 *
 * Una sola consulta agrupada por `status` alimenta el total, la distribución,
 * el cumplimiento, el cycle time promedio y "completadas/hora" — son la misma
 * pregunta ("cuántas y de qué tipo") mirada de varios ángulos, no hace falta
 * pedirla cuatro veces.
 */
export function useOrderStats(period: PeriodId, customRange: DateRange | undefined, slaMs: number) {
  const bounds = useMemo(() => periodToBounds(period, customRange), [period, customRange]);
  const oWindow = useMemo(() => ordersWindow(bounds), [bounds]);
  // Con 92 días como máximo, buckets por hora darían ~2200 puntos — gráfico
  // ilegible. Sólo tiene sentido en la ventana más chica.
  const bucket = period === "24h" ? "hour" : "day";

  const windowKey = [oWindow.from.toISOString(), oWindow.to.toISOString()] as const;

  const byStatus = useQuery({
    queryKey: ["order-stats-status", ...windowKey],
    queryFn: () =>
      queryEntity<{ status: string; n: number; avg_cycle_ms: number | null }>("orders", {
        filters: oWindow.filters,
        group_by: [{ field: "status", as: "status" }],
        aggregates: [
          { op: "count", as: "n" },
          { op: "avg", field: "cycle_time_ms", as: "avg_cycle_ms" },
        ],
      }),
    refetchInterval: 30_000,
  });

  const byPriority = useQuery({
    queryKey: ["order-stats-priority", ...windowKey],
    queryFn: () =>
      queryEntity<{ priority: string | null; n: number }>("orders", {
        filters: oWindow.filters,
        group_by: [{ field: "priority", as: "priority" }],
        aggregates: [{ op: "count", as: "n" }],
      }),
    refetchInterval: 30_000,
  });

  // Receta 14 — dos llamadas, con umbral y sin. La sin-umbral es byStatus de
  // arriba (counts.completed); acá sólo se pide la que sí filtra, para no
  // repetir la mitad de la consulta.
  const bySla = useQuery({
    queryKey: ["order-stats-sla", ...windowKey, slaMs],
    queryFn: () =>
      queryEntity<{ status: string; n: number }>("orders", {
        filters: [...oWindow.filters, { field: "cycle_time_ms", op: "lte", value: slaMs }],
        group_by: [{ field: "status", as: "status" }],
        aggregates: [{ op: "count", as: "n" }],
      }),
    refetchInterval: 30_000,
  });

  const byBucket = useQuery({
    queryKey: ["order-stats-bucket", ...windowKey, bucket],
    queryFn: () =>
      queryEntity<{ bucket: string; orders: number }>("orders", {
        filters: oWindow.filters,
        group_by: [{ field: "created_at", bucket, as: "bucket" }],
        aggregates: [{ op: "count", as: "orders" }],
        // 92 días en buckets diarios son ~92 filas; el tope de 1000 sobra.
        size: 1000,
      }),
    refetchInterval: 30_000,
  });

  return useMemo(() => {
    const counts: Record<OrderState, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };
    let completedAvgCycleMs: number | null = null;
    for (const row of byStatus.data?.items ?? []) {
      const state = row.status?.toLowerCase() as OrderState | undefined;
      if (!state || !(state in counts)) continue;
      counts[state] = row.n;
      if (state === "completed") completedAvgCycleMs = row.avg_cycle_ms;
    }
    const total = counts.pending + counts.in_progress + counts.completed + counts.cancelled;

    const priorityCounts: Record<Priority, number> = {
      urgente: 0,
      alta: 0,
      media: 0,
      baja: 0,
    };
    for (const row of byPriority.data?.items ?? []) {
      const p = mapOrderPriority(row.priority) as Priority;
      priorityCounts[p] += row.n;
    }

    const withinSla =
      bySla.data?.items.find((r) => r.status?.toLowerCase() === "completed")?.n ?? 0;
    // null, no 0, cuando no hubo completadas: "0% de cumplimiento" y "no hay
    // datos para medir" son afirmaciones distintas.
    const slaPct = counts.completed > 0 ? Math.round((withinSla / counts.completed) * 100) : null;

    const hours = oWindow.days * 24;
    const ordersPerHour = hours > 0 ? +(counts.completed / hours).toFixed(2) : 0;
    const cycleTimeMin =
      completedAvgCycleMs !== null ? +(completedAvgCycleMs / 60_000).toFixed(1) : null;

    // Antes devolvía 100 cuando no había completadas NI canceladas — un almacén
    // sin actividad se leía como "100% de cumplimiento", que es lo opuesto de
    // lo que pasó: no hay nada que medir.
    const compliancePct =
      counts.completed + counts.cancelled > 0
        ? Math.round((counts.completed / (counts.completed + counts.cancelled)) * 100)
        : null;

    const hourly: HourlyPoint[] = [...(byBucket.data?.items ?? [])]
      .sort((a, b) => a.bucket.localeCompare(b.bucket))
      .map((r) => ({
        bucket: r.bucket,
        label: formatBucketLabel(r.bucket, bucket),
        orders: r.orders,
      }));

    // Objetos nuevos armados a partir de campos primitivos, no las queries
    // completas: así el linter de deps del useMemo puede verificar la lista de
    // abajo sin pedir los objetos de useQuery enteros como dependencia.
    const source = combineSources([
      { isLoading: byStatus.isLoading, isError: byStatus.isError },
      { isLoading: byPriority.isLoading, isError: byPriority.isError },
      { isLoading: bySla.isLoading, isError: bySla.isError },
      { isLoading: byBucket.isLoading, isError: byBucket.isError },
    ]);

    return {
      counts,
      total,
      priorityCounts,
      slaPct,
      ordersPerHour,
      cycleTimeMin,
      compliancePct,
      hourly,
      /** True si el rango elegido excedía los 92 días que `orders` admite por consulta. */
      windowClamped: oWindow.clamped,
      source,
      isLoading: byStatus.isLoading || byPriority.isLoading,
    };
  }, [
    byStatus.data,
    byStatus.isLoading,
    byStatus.isError,
    byPriority.data,
    byPriority.isLoading,
    byPriority.isError,
    bySla.data,
    bySla.isLoading,
    bySla.isError,
    byBucket.data,
    byBucket.isLoading,
    byBucket.isError,
    oWindow.days,
    oWindow.clamped,
    bucket,
  ]);
}

export function formatBucketLabel(bucket: string, kind: "hour" | "day"): string {
  // Los buckets ya vienen resueltos a la zona pedida (Buenos Aires por
  // defecto) como strings sin sufijo de zona. Parsearlos con Date acá
  // reintroduciría el problema que evitan: un bucket de sólo fecha
  // ("2026-08-01") se lee como medianoche UTC, que en Buenos Aires cae en el
  // día anterior. Se recortan como texto en vez de pasar por Date.
  if (kind === "hour") return bucket.split("T")[1]?.slice(0, 5) ?? bucket;
  const [, month, day] = bucket.split("-");
  return `${day}/${month}`;
}

function combineSources(results: Array<{ isError: boolean; isLoading: boolean }>): DataSource {
  const sources = results.map(
    (r): DataSource => (r.isLoading || !r.isError ? "live" : "unavailable"),
  );
  return worstSource(sources);
}
