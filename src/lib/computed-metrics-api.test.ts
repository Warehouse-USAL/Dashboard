import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { suggestionConversionBuckets } from "@/test/msw/handlers";
import {
  ComputedMetricError,
  conversionGranularity,
  fetchSuggestionConversion,
  ratePct,
  sumConversion,
} from "./computed-metrics-api";

describe("conversionGranularity", () => {
  it("el backend no agrupa por hora: 24 h cae en intervalos de día", () => {
    expect(conversionGranularity("hour")).toBe("day");
    expect(conversionGranularity("day")).toBe("day");
    expect(conversionGranularity("week")).toBe("week");
    expect(conversionGranularity("month")).toBe("month");
  });
});

describe("sumConversion / ratePct", () => {
  it("suma los conteos de todos los intervalos (los del ejemplo de la guía)", () => {
    const t = sumConversion(suggestionConversionBuckets);
    expect(t).toEqual({
      orders: 33,
      ordersWithRecommendation: 9,
      lines: 71,
      linesFromRecommendation: 12,
      units: 164,
      unitsFromRecommendation: 25,
    });
    // 27 % de los pedidos, pero sólo 17 % de las líneas y 15 % de las unidades:
    // basta una línea recomendada para que el pedido cuente.
    expect(Math.round(ratePct(t.ordersWithRecommendation, t.orders)!)).toBe(27);
    expect(Math.round(ratePct(t.linesFromRecommendation, t.lines)!)).toBe(17);
    expect(Math.round(ratePct(t.unitsFromRecommendation, t.units)!)).toBe(15);
  });

  it("las tasas del período salen de la suma, no del promedio de las tasas de cada día", () => {
    // Día A: 1 de 1 (100 %). Día B: 1 de 99 (~1 %). El promedio de tasas daría ~50,5 %.
    const t = sumConversion([
      { ...suggestionConversionBuckets[0], orders: 1, orders_with_recommendation: 1 },
      { ...suggestionConversionBuckets[1], orders: 99, orders_with_recommendation: 1 },
    ]);
    expect(ratePct(t.ordersWithRecommendation, t.orders)).toBe(2);
  });

  it("sin pedidos no hay tasa (null), no 0 %", () => {
    expect(ratePct(0, 0)).toBeNull();
    expect(ratePct(0, 5)).toBe(0);
  });
});

describe("fetchSuggestionConversion", () => {
  it("manda el rango, la agrupación y la zona horaria de Buenos Aires", async () => {
    let sent: unknown;
    server.use(
      http.post("*/metrics/suggestion-conversion", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ metric: "suggestion_conversion", data: [] });
      }),
    );

    await fetchSuggestionConversion({
      from: "2026-11-09T00:00:00.000Z",
      to: "2026-11-16T00:00:00.000Z",
      granularity: "day",
    });

    expect(sent).toEqual({
      params: {
        from: "2026-11-09T00:00:00.000Z",
        to: "2026-11-16T00:00:00.000Z",
        granularity: "day",
        time_zone: "America/Argentina/Buenos_Aires",
      },
    });
  });

  it("devuelve los intervalos tal cual los manda el backend", async () => {
    const data = await fetchSuggestionConversion({
      from: "2026-11-14T00:00:00.000Z",
      to: "2026-11-17T00:00:00.000Z",
      granularity: "day",
    });
    expect(data).toHaveLength(3);
    expect(data[0].orders_with_recommendation).toBe(4);
  });

  it("un error del backend conserva el código y el estado HTTP", async () => {
    server.use(
      http.post("*/metrics/suggestion-conversion", () =>
        HttpResponse.json(
          { error: { code: "INVALID_METRIC_PARAMS", message: "granularity inválida" } },
          { status: 400 },
        ),
      ),
    );

    const err = await fetchSuggestionConversion({
      from: "2026-11-09T00:00:00.000Z",
      to: "2026-11-16T00:00:00.000Z",
      granularity: "day",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ComputedMetricError);
    expect((err as ComputedMetricError).code).toBe("INVALID_METRIC_PARAMS");
    expect((err as ComputedMetricError).status).toBe(400);
  });
});
