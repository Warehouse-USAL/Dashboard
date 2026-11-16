import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { periodToBounds, type PeriodId } from "@/lib/dateRange";
import { ordersWindow, queryEntity, type Filter } from "@/lib/query-api";
import { worstSource, type DataSource } from "@/lib/data-source";
import { backendBucketToEpoch, bucketKeys, fillSeries } from "@/lib/series-fill";
import { bucketRangeLabel, granularityFor } from "@/lib/granularity";
import { formatBucketLabel, type HourlyPoint } from "./useOrderStats";

export type HomeChartPoint = {
  bucket: string;
  label: string;
  /** Rango completo de la semana o el mes, para el tooltip. */
  range?: string;
  completadas: number;
  canceladas: number;
  /** Unidades despachadas (suma de `items.quantity` de las órdenes completadas). */
  unidades: number;
};

/**
 * Series de los dos gráficos de Home, agrupadas igual que las de Órdenes
 * (`granularityFor`): hora, día, semana o mes según el período.
 *
 * Las completadas por intervalo ya las calcula `useOrderStats` (por fecha de
 * completado) y Home ya lo usa, así que llegan por parámetro en vez de repetir la
 * consulta: el gráfico coincide con el de Órdenes por construcción. Acá se piden
 * sólo las dos series que faltan:
 *
 * - Unidades despachadas: órdenes completadas, por fecha de completado, sumando
 *   `items.quantity` (receta 15 de DASHBOARD_INTEGRATION.md; `unwind` es
 *   obligatorio para tocar `items.*`).
 * - Canceladas: el backend no guarda cuándo se canceló una orden (`completed_at`
 *   queda en null y no existe `cancelled_at`), así que se ubican por fecha de
 *   creación.
 */
export function useHomeCharts(period: PeriodId, completed: HourlyPoint[]) {
  const bounds = useMemo(() => periodToBounds(period), [period]);
  const createdWindow = useMemo(() => ordersWindow(bounds), [bounds]);
  const completedWindow = useMemo(() => ordersWindow(bounds, "completed_at"), [bounds]);
  const kind = granularityFor(period);
  // El backend sólo agrupa por hora o por día; semana y mes se arman sumando días.
  const bucket = kind === "hour" ? "hour" : "day";
  const windowKey = [createdWindow.from.toISOString(), createdWindow.to.toISOString()] as const;

  // `status` va en MAYÚSCULAS: `/query/*` lee los documentos crudos de Mongo.
  const unitsFilters = useMemo<Filter[]>(
    () => [...completedWindow.filters, { field: "status", op: "eq", value: "COMPLETED" }],
    [completedWindow],
  );
  const cancelledFilters = useMemo<Filter[]>(
    () => [...createdWindow.filters, { field: "status", op: "eq", value: "CANCELLED" }],
    [createdWindow],
  );

  const units = useQuery({
    queryKey: ["home-picking-units", ...windowKey, bucket],
    queryFn: () =>
      queryEntity<{ bucket: string; units: number }>("orders", {
        filters: unitsFilters,
        unwind: "items",
        group_by: [{ field: "completed_at", bucket, as: "bucket" }],
        aggregates: [{ op: "sum", field: "items.quantity", as: "units" }],
        size: 1000,
      }),
    refetchInterval: 30_000,
  });

  const cancelled = useQuery({
    queryKey: ["home-cancelled-bucket", ...windowKey, bucket],
    queryFn: () =>
      queryEntity<{ bucket: string; cancelled: number }>("orders", {
        filters: cancelledFilters,
        group_by: [{ field: "created_at", bucket, as: "bucket" }],
        aggregates: [{ op: "count", as: "cancelled" }],
        size: 1000,
      }),
    refetchInterval: 30_000,
  });

  return useMemo(() => {
    // Mientras carga no se rellena la grilla: un período entero en cero se
    // confundiría con "no hubo nada".
    const ready = units.data && cancelled.data;
    const keys = ready ? bucketKeys(createdWindow.from, createdWindow.to, kind) : [];
    const unitRows = fillSeries(units.data?.items ?? [], keys, kind, "units");
    const cancelledRows = fillSeries(cancelled.data?.items ?? [], keys, kind, "cancelled");
    const completedByBucket = new Map(completed.map((p) => [p.bucket, p.orders]));
    const cancelledByBucket = new Map(cancelledRows.map((r) => [r.bucket, r.cancelled]));

    const points: HomeChartPoint[] = unitRows.map((r) => ({
      bucket: r.bucket,
      label: formatBucketLabel(r.bucket, kind),
      range:
        kind === "week" || kind === "month"
          ? bucketRangeLabel(
              backendBucketToEpoch(r.bucket),
              kind,
              createdWindow.from.getTime() / 1000,
              createdWindow.to.getTime() / 1000,
            )
          : undefined,
      completadas: completedByBucket.get(r.bucket) ?? 0,
      canceladas: cancelledByBucket.get(r.bucket) ?? 0,
      unidades: r.units,
    }));

    const sources: DataSource[] = [
      { isLoading: units.isLoading, isError: units.isError },
      { isLoading: cancelled.isLoading, isError: cancelled.isError },
    ].map((q) => (q.isLoading || !q.isError ? "live" : "unavailable"));

    return { points, bucketKind: kind, source: worstSource(sources) };
  }, [
    units.data,
    units.isLoading,
    units.isError,
    cancelled.data,
    cancelled.isLoading,
    cancelled.isError,
    completed,
    createdWindow.from,
    createdWindow.to,
    kind,
  ]);
}
