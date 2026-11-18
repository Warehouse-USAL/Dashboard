import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { periodToBounds, type PeriodId } from "@/lib/dateRange";
import {
  ComputedMetricError,
  conversionGranularity,
  fetchSuggestionConversion,
  ratePct,
  sumConversion,
  type ConversionBucket,
} from "@/lib/computed-metrics-api";
import type { DataSource } from "@/lib/data-source";
import { backendBucketToEpoch } from "@/lib/series-fill";
import { bucketRangeLabel, granularityFor } from "@/lib/granularity";
import { formatBucketLabel } from "./useOrderStats";

export type AdoptionPoint = {
  bucket: string;
  label: string;
  /** Rango completo de la semana o el mes, para el tooltip. */
  range?: string;
  /** Tasas en %, o `null` si el intervalo no tuvo pedidos. */
  ordersPct: number | null;
  linesPct: number | null;
  unitsPct: number | null;
  /** Conteos crudos del intervalo, para el tooltip. */
  counts: ConversionBucket;
};

/**
 * Adopción de las recomendaciones de la app móvil — `POST /metrics/suggestion-conversion`.
 *
 * Mide qué parte de lo pedido vino marcado como `from_recommendation` (marca que
 * declara el cliente). NO es una conversión: no existe el dato de cuántas
 * recomendaciones se mostraron. Cuenta pedidos no cancelados, por fecha de creación.
 *
 * Las tasas del período se calculan sobre la SUMA de los conteos, no promediando las
 * tasas de cada intervalo (un día con 3 pedidos no puede pesar lo que uno con 50).
 */
export function useSuggestionAdoption(period: PeriodId) {
  const bounds = useMemo(() => periodToBounds(period), [period]);
  const from = useMemo(() => new Date(bounds.from).toISOString(), [bounds]);
  const to = useMemo(() => new Date(bounds.to).toISOString(), [bounds]);
  // La agrupación de los demás gráficos, pero sin hora: 24 h cae en intervalos de día.
  const kind = conversionGranularity(granularityFor(period));

  const query = useQuery({
    queryKey: ["suggestion-adoption", from, to, kind],
    queryFn: () => fetchSuggestionConversion({ from, to, granularity: kind }),
    // No es LIVE: depende del período elegido y cambia lento.
    refetchInterval: 60_000,
  });

  return useMemo(() => {
    const buckets = query.data ?? [];
    const totals = sumConversion(buckets);

    const points: AdoptionPoint[] = buckets.map((b) => ({
      bucket: b.bucket,
      label: formatBucketLabel(b.bucket, kind),
      range:
        kind === "week" || kind === "month"
          ? bucketRangeLabel(
              backendBucketToEpoch(b.bucket),
              kind,
              new Date(from).getTime() / 1000,
              new Date(to).getTime() / 1000,
            )
          : undefined,
      ordersPct: ratePct(b.orders_with_recommendation, b.orders),
      linesPct: ratePct(b.lines_from_recommendation, b.lines),
      unitsPct: ratePct(b.units_from_recommendation, b.units),
      counts: b,
    }));

    // Sólo primitivos del error en las deps: el objeto de useQuery entero
    // cambia en cada render.
    const status = query.error instanceof ComputedMetricError ? query.error.status : null;
    const source: DataSource = !query.isError
      ? "live"
      : status === 403
        ? "forbidden"
        : "unavailable";

    return {
      totals,
      ordersPct: ratePct(totals.ordersWithRecommendation, totals.orders),
      linesPct: ratePct(totals.linesFromRecommendation, totals.lines),
      unitsPct: ratePct(totals.unitsFromRecommendation, totals.units),
      points,
      bucketKind: kind,
      /** Con menos de 3 intervalos (p. ej. 24 h: ayer y hoy) una línea no cuenta nada. */
      hasEvolution: points.length >= 3,
      source,
      isLoading: query.isLoading,
    };
  }, [query.data, query.isError, query.error, query.isLoading, kind, from, to]);
}
