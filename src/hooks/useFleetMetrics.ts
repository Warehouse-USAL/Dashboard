import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { periodToBounds, type PeriodId } from "@/lib/dateRange";
import {
  avgPoints,
  byLabel,
  metricsQuery,
  metricsWindow,
  formatInstant,
  mtbfSeconds,
  mttrSeconds,
  stepToSeconds,
  sumPoints,
  type MetricsResult,
  type Series,
} from "@/lib/metrics-api";
import { ordersWindow, queryEntity } from "@/lib/query-api";
import { worstSource, type DataSource } from "@/lib/data-source";

/**
 * El estado al que transiciona un rover cuando falla de verdad.
 *
 * Es OFFLINE y no ERROR: `VehicleErrorConsumer` es el único punto del backend
 * donde llega un `error_code` de la Central, y deja al vehículo en OFFLINE.
 * ERROR sólo aparece cuando el rover se autoreporta así en su telemetría de
 * rutina, camino que nunca trae código — por eso esas transiciones quedan
 * siempre UNCATEGORIZED. Filtrando por ERROR no se ve ninguna falla
 * categorizada, aunque hayan ocurrido.
 */
const FAILURE_STATE = "OFFLINE";

/**
 * Paso de la consulta de utilización. Fijo: 30 días son 720 puntos por rover,
 * lejos del tope de 11 000, y no depende del período elegido.
 */
const BUSY_FRACTION_STEP = "1h";

export type RoverFailurePoint = { t: number; [vehicleId: string]: number };

export type FleetVehicleStats = {
  vehicleId: string;
  failures: number;
  mtbfSeconds: number | null;
  mttrSeconds: number | null;
  /** Órdenes COMPLETED del período. */
  orders: number;
  /**
   * completadas / (completadas + canceladas), en %. Las órdenes en curso no
   * cuentan. `null` si el rover no tiene ninguna orden cerrada en el período.
   */
  fulfillmentRate: number | null;
};

export type ParetoBar = { label: string; failures: number; pct: number };

export type ActivityPoint = { t: number; label: string; rovers: number; orders: number };

/**
 * Todo lo que la página de Vehículos necesita del backend, en un solo hook.
 *
 * Cruza las dos APIs a propósito: las fallas y la ocupación salen de las series
 * de VictoriaMetrics, pero "cuántas órdenes hizo cada rover" es un dato de
 * negocio y vive en Mongo. Son fuentes que pueden fallar por separado —
 * VictoriaMetrics puede estar caído con `/query/*` sano — así que cada bloque
 * lleva su propia procedencia y la página decide qué panel degrada.
 *
 * Las divisiones (MTBF, MTTR, porcentajes del Pareto) se hacen acá, no en el
 * backend, que publica sólo las señales crudas.
 */
export function useFleetMetrics(period: PeriodId, customRange?: DateRange) {
  const bounds = useMemo(() => periodToBounds(period, customRange), [period, customRange]);
  const mWindow = useMemo(() => metricsWindow(bounds), [bounds]);
  const oWindow = useMemo(() => ordersWindow(bounds), [bounds]);

  // Step adaptativo: el backend rechaza más de 11000 puntos por serie, y un
  // gráfico con 2000 barras tampoco se lee. ~1h para ventanas cortas, más grueso
  // a medida que la ventana crece.
  const step = useMemo(() => {
    const hours = mWindow.seconds / 3600;
    if (hours <= 26) return "1h";
    if (hours <= 24 * 8) return "6h";
    return "1d";
  }, [mWindow.seconds]);

  const metricsKey = [mWindow.from, mWindow.to, step] as const;

  // Receta 1 — fallas por rover.
  //
  // El estado de falla es OFFLINE, no ERROR. `VehicleErrorConsumer` es el único
  // lugar donde llega un error_code real de la Central, y pone al vehículo en
  // OFFLINE. ERROR sólo aparece cuando el rover se autoreporta así en su
  // telemetría de rutina, y ese camino nunca trae código. Filtrar por ERROR
  // dejaría fuera todas las fallas categorizadas.
  const failures = useQuery({
    queryKey: ["fleet-failures", ...metricsKey],
    queryFn: () =>
      metricsQuery({
        metric: "wh.vehicle.transitions",
        from: mWindow.from,
        to: mWindow.to,
        step,
        agg: "increase",
        group_by: ["vehicle_id"],
        filters: { to: FAILURE_STATE },
      }),
    refetchInterval: 30_000,
  });

  // Receta 2 — Pareto por categoría real: CONNECTION_LOST, BATTERY_CRITICAL,
  // MECHANICAL_FAULT, COLLISION, NAVIGATION_ERROR, u OTHER para un código que no
  // esté en esa lista. Queda UNCATEGORIZED lo que no pasó por `vehicle.error`.
  const pareto = useQuery({
    queryKey: ["fleet-pareto", ...metricsKey],
    queryFn: () =>
      metricsQuery({
        metric: "wh.vehicle.transitions",
        from: mWindow.from,
        to: mWindow.to,
        step,
        agg: "increase",
        group_by: ["category"],
        filters: { to: FAILURE_STATE },
      }),
    refetchInterval: 30_000,
  });

  // Receta 4 (insumo de MTTR) — fracción del período en falla, por rover.
  //
  // Ojo: esta consulta puede devolver una fracción > 0 para un rover que nunca
  // falló, p.ej. uno apagado todo el período que jamás emitió un `vehicle.error`.
  // Por eso la cantidad de fallas se toma de la consulta de arriba y el
  // `failures > 0 ? … : null` de mttrSeconds es el que decide.
  const inError = useQuery({
    queryKey: ["fleet-in-error", ...metricsKey],
    queryFn: () =>
      metricsQuery({
        metric: "wh.vehicle.state",
        from: mWindow.from,
        to: mWindow.to,
        step,
        agg: "avg",
        group_by: ["vehicle_id"],
        filters: { state: FAILURE_STATE },
      }),
    refetchInterval: 30_000,
  });

  // Receta 5 — rovers activos simultáneamente. Sin group_by: total de la flota.
  // Da decimales con step grande y es correcto: es el promedio de rovers BUSY
  // durante el bloque, no un conteo instantáneo.
  const active = useQuery({
    queryKey: ["fleet-active", ...metricsKey],
    queryFn: () =>
      metricsQuery({
        metric: "wh.vehicle.state",
        from: mWindow.from,
        to: mWindow.to,
        step,
        agg: "count",
        filters: { state: "BUSY" },
      }),
    refetchInterval: 30_000,
  });

  // Utilización de la flota — fracción del período que cada rover pasó BUSY.
  //
  // Consulta propia y no la serie de `active`: aquella es para graficar y su
  // paso cambia con el período (1h/6h/1d). Acá el paso es fijo porque sólo
  // importa el promedio de toda la ventana. Con `avg` sobre el gauge 1/0, cada
  // bloque vale la fracción de tiempo ocupado, y promediar bloques de igual
  // largo es tiempo ocupado / tiempo total. Un rover que nunca estuvo BUSY no
  // trae serie: la página divide por el total de la flota, así que cuenta como 0.
  const busyFraction = useQuery({
    queryKey: ["fleet-busy-fraction", mWindow.from, mWindow.to],
    queryFn: () =>
      metricsQuery({
        metric: "wh.vehicle.state",
        from: mWindow.from,
        to: mWindow.to,
        step: BUSY_FRACTION_STEP,
        agg: "avg",
        group_by: ["vehicle_id"],
        filters: { state: "BUSY" },
      }),
    refetchInterval: 30_000,
  });

  // Receta 11 — productividad por rover. Dato de negocio, va contra Mongo.
  //
  // Se agrupa por vehículo Y estado (dos claves, el tope son tres) en una sola
  // consulta: con eso sale tanto "cuántas órdenes tuvo" como "cuántas terminó",
  // que es la tasa de cumplimiento real. La página venía mostrando una
  // "eficiencia" inventada a partir del estado y la batería del rover.
  const ordersByVehicle = useQuery({
    queryKey: ["orders-by-vehicle", oWindow.from.toISOString(), oWindow.to.toISOString()],
    queryFn: () =>
      queryEntity<{ vehicle: string; status: string; orders: number }>("orders", {
        filters: [...oWindow.filters, { field: "assigned_vehicle_id", op: "exists", value: true }],
        group_by: [
          { field: "assigned_vehicle_id", as: "vehicle" },
          { field: "status", as: "status" },
        ],
        aggregates: [{ op: "count", as: "orders" }],
        size: 500,
      }),
    refetchInterval: 30_000,
  });

  // Receta 9 — órdenes por hora, la otra mitad del gráfico de actividad.
  const ordersByHour = useQuery({
    queryKey: ["orders-by-hour", oWindow.from.toISOString(), oWindow.to.toISOString()],
    queryFn: () =>
      queryEntity<{ hour: string; orders: number }>("orders", {
        filters: oWindow.filters,
        group_by: [{ field: "created_at", bucket: "hour", as: "hour" }],
        aggregates: [{ op: "count", as: "orders" }],
        // Una ventana de 30 días tiene 720 horas; 1000 es el tope del backend en
        // modo agregado. Con 500 podríamos perder buckets en un almacén activo.
        size: 1000,
      }),
    refetchInterval: 30_000,
  });

  return useMemo(() => {
    const failureSeries = seriesOf(failures.data);
    const inErrorSeries = seriesOf(inError.data);
    const activeSeries = seriesOf(active.data);

    // Suma de la fracción de tiempo BUSY de cada rover (0..1 c/u). `null` si la
    // consulta falló: sin datos no es 0 %, es "no sé".
    const busyFractionSum = busyFraction.data?.ok
      ? seriesOf(busyFraction.data).reduce((acc, s) => acc + avgPoints(s), 0)
      : null;

    const failuresByVehicle = byLabel(failureSeries, "vehicle_id");
    const inErrorByVehicle = byLabel(inErrorSeries, "vehicle_id");

    // `/query/*` lee documentos crudos de Mongo, así que `status` llega en
    // MAYÚSCULAS ("COMPLETED"), mientras que `GET /orders` lo serializa en
    // minúsculas. Se normaliza acá, en el borde.
    const ordersTotalByVehicle = new Map<string, number>();
    const ordersDoneByVehicle = new Map<string, number>();
    const ordersCancelledByVehicle = new Map<string, number>();
    for (const row of ordersByVehicle.data?.items ?? []) {
      ordersTotalByVehicle.set(
        row.vehicle,
        (ordersTotalByVehicle.get(row.vehicle) ?? 0) + row.orders,
      );
      const status = row.status?.toLowerCase();
      if (status === "completed") {
        ordersDoneByVehicle.set(
          row.vehicle,
          (ordersDoneByVehicle.get(row.vehicle) ?? 0) + row.orders,
        );
      } else if (status === "cancelled") {
        ordersCancelledByVehicle.set(
          row.vehicle,
          (ordersCancelledByVehicle.get(row.vehicle) ?? 0) + row.orders,
        );
      }
    }

    // Un rover puede aparecer en cualquiera de las tres fuentes: uno que nunca
    // falló no tiene serie de fallas, y uno sin órdenes no está en Mongo.
    const vehicleIds = new Set<string>([
      ...failuresByVehicle.keys(),
      ...inErrorByVehicle.keys(),
      ...ordersTotalByVehicle.keys(),
    ]);

    const perVehicle: FleetVehicleStats[] = [...vehicleIds]
      .map((vehicleId) => {
        const n = failuresByVehicle.has(vehicleId)
          ? sumPoints(failuresByVehicle.get(vehicleId)!)
          : 0;
        const fraction = inErrorByVehicle.has(vehicleId)
          ? avgPoints(inErrorByVehicle.get(vehicleId)!)
          : 0;
        const completed = ordersDoneByVehicle.get(vehicleId) ?? 0;
        const closed = completed + (ordersCancelledByVehicle.get(vehicleId) ?? 0);
        return {
          vehicleId,
          failures: n,
          mtbfSeconds: mtbfSeconds(n, mWindow.seconds),
          mttrSeconds: mttrSeconds(n, fraction, mWindow.seconds),
          orders: completed,
          // Sólo órdenes cerradas: una en curso todavía no es cumplida ni
          // incumplida, y contarla en el denominador bajaba el % hasta que
          // terminara. null, no 0, cuando no cerró ninguna: no tiene cumplimiento.
          fulfillmentRate: closed > 0 ? (completed / closed) * 100 : null,
        };
      })
      .sort((a, b) => b.orders - a.orders);

    // MTBF/MTTR de la flota: se promedian sólo los rovers que fallaron. Meter a
    // los que no fallaron como 0 hundiría el promedio y diría lo contrario de lo
    // que pasó.
    const withFailures = perVehicle.filter((v) => v.failures > 0);
    const fleetMtbf = averageOrNull(withFailures.map((v) => v.mtbfSeconds));
    const fleetMttr = averageOrNull(withFailures.map((v) => v.mttrSeconds));

    // Histórico: una fila por instante, una columna por rover, para graficarlo
    // tal cual sin transformar en el componente.
    const timestamps = new Set<number>();
    failureSeries.forEach((s) => s.points.forEach(([t]) => timestamps.add(t)));
    const failureHistory: RoverFailurePoint[] = [...timestamps]
      .sort((a, b) => a - b)
      .map((t) => {
        const row = { t } as RoverFailurePoint;
        for (const [vehicleId, s] of failuresByVehicle) {
          row[vehicleId] = s.points.find(([pt]) => pt === t)?.[1] ?? 0;
        }
        return row;
      });

    const paretoSeries = seriesOf(pareto.data);
    const paretoRaw = paretoSeries
      .map((s) => ({ label: s.labels.category ?? "UNCATEGORIZED", failures: sumPoints(s) }))
      .filter((b) => b.failures > 0)
      .sort((a, b) => b.failures - a.failures);
    const paretoTotal = paretoRaw.reduce((acc, b) => acc + b.failures, 0);
    const paretoBars: ParetoBar[] = paretoRaw.map((b) => ({
      ...b,
      pct: paretoTotal > 0 ? (b.failures / paretoTotal) * 100 : 0,
    }));

    // Actividad: rovers activos (métricas) contra órdenes creadas (Mongo).
    //
    // Las dos fuentes vienen con granularidad distinta y hay que reconciliarlas:
    // la serie usa el `step` (que con ventanas largas es de 6h o 1d) mientras que
    // el backend sólo bucketea fechas por hour/day/month, así que pedimos la más
    // fina (hora) y sumamos acá. Antes esto matcheaba por hora exacta contra un
    // punto diario, y cada punto levantaba las órdenes de UNA hora de las 24 —
    // el gráfico mostraba una fracción de la actividad real.
    //
    // Los buckets vienen como "2026-08-01T19:00:00" en hora local de Buenos
    // Aires, sin zona; se parsean como local para que no se corran tres horas.
    const points = activeSeries[0]?.points ?? [];
    const stepSeconds = stepToSeconds(step);
    const firstT = points[0]?.[0];
    const ordersByPoint = new Map<number, number>();
    if (firstT !== undefined) {
      for (const row of ordersByHour.data?.items ?? []) {
        const t = localHourToEpoch(row.hour);
        if (t < firstT) continue; // fuera del rango que grafica la serie
        // Los puntos están equiespaciados por `step`, así que el índice sale de
        // una división en vez de buscar el intervalo que lo contiene.
        const pointT = points[Math.floor((t - firstT) / stepSeconds)]?.[0];
        if (pointT !== undefined) {
          ordersByPoint.set(pointT, (ordersByPoint.get(pointT) ?? 0) + row.orders);
        }
      }
    }

    const activity: ActivityPoint[] = points.map(([t, rovers]) => ({
      t,
      label: formatInstant(t, stepSeconds),
      rovers,
      orders: ordersByPoint.get(t) ?? 0,
    }));

    const metricsSource = combineSources([
      failures.data,
      pareto.data,
      inError.data,
      active.data,
      busyFraction.data,
    ]);
    const ordersSource: DataSource =
      ordersByVehicle.isError || ordersByHour.isError ? "mock" : "live";

    return {
      perVehicle,
      fleetMtbf,
      fleetMttr,
      busyFractionSum,
      failureHistory,
      vehicleIds: [...failuresByVehicle.keys()].sort(),
      paretoBars,
      activity,
      /**
       * True cuando el período elegido excedía lo que una consulta puede abarcar
       * y se recortó. Los gráficos muestran menos días de los pedidos, así que
       * la página TIENE que decirlo: si no, se lee como que no hay datos viejos.
       */
      clampedToRetention: mWindow.clamped,
      /** Días que los gráficos de flota terminan mostrando, ya recortados. */
      shownDays: Math.round(mWindow.seconds / 86_400),
      /** Paso de las series; el eje de tiempo ajusta su formato según esto. */
      stepSeconds: stepToSeconds(step),
      windowSeconds: mWindow.seconds,
      metricsSource,
      ordersSource,
      source: worstSource([metricsSource, ordersSource]),
      isLoading: failures.isLoading || active.isLoading || ordersByVehicle.isLoading,
    };
  }, [
    failures.data,
    failures.isLoading,
    pareto.data,
    inError.data,
    active.data,
    active.isLoading,
    busyFraction.data,
    ordersByVehicle.data,
    ordersByVehicle.isError,
    ordersByVehicle.isLoading,
    ordersByHour.data,
    ordersByHour.isError,
    mWindow.seconds,
    mWindow.clamped,
    step,
  ]);
}

function seriesOf(result: MetricsResult | undefined): Series[] {
  return result?.ok ? result.response.series : [];
}

/** La peor procedencia de las consultas de métricas: un panel mixto no es "casi real". */
function combineSources(results: Array<MetricsResult | undefined>): DataSource {
  const sources = results.map((r): DataSource => {
    if (!r) return "live"; // todavía cargando; no hay nada que confesar aún
    if (r.ok) return "live";
    return r.reason === "forbidden" ? "forbidden" : "unavailable";
  });
  return worstSource(sources);
}

function averageOrNull(values: Array<number | null>): number | null {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0) return null;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

/**
 * Los buckets de fecha vienen como `"2026-08-01T19:00:00"` en hora local de
 * Buenos Aires, sin sufijo de zona. `Date.parse` de un string sin zona lo trata
 * como local, que es exactamente lo que queremos: si lo forzáramos a UTC, las
 * órdenes quedarían tres horas corridas respecto de las series.
 */
function localHourToEpoch(bucket: string): number {
  return Math.floor(new Date(bucket).getTime() / 1000);
}
