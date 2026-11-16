import { describe, expect, it } from "vitest";
import { fillSeries } from "./series-fill";
import { ordersByBucketTitle, pickingSubtitle } from "./granularity";

describe("fillSeries", () => {
  it("rellena con 0 la columna pedida y respeta su nombre", () => {
    const keys = ["2026-10-07", "2026-10-08", "2026-10-09"];
    const out = fillSeries([{ bucket: "2026-10-08", units: 40 }], keys, "day", "units");
    expect(out).toEqual([
      { bucket: "2026-10-07", units: 0 },
      { bucket: "2026-10-08", units: 40 },
      { bucket: "2026-10-09", units: 0 },
    ]);
  });

  it("en agrupación semanal suma los días de la misma semana (lunes a domingo)", () => {
    // 06/10/2026 es martes: la semana empieza el lunes 05/10.
    const out = fillSeries(
      [
        { bucket: "2026-10-06", cancelled: 2 },
        { bucket: "2026-10-08", cancelled: 3 },
        { bucket: "2026-10-12", cancelled: 1 },
      ],
      ["2026-10-05", "2026-10-12"],
      "week",
      "cancelled",
    );
    expect(out).toEqual([
      { bucket: "2026-10-05", cancelled: 5 },
      { bucket: "2026-10-12", cancelled: 1 },
    ]);
  });
});

describe("títulos de Home según la agrupación", () => {
  it("cambian con hora/día/semana/mes", () => {
    expect(ordersByBucketTitle("hour")).toBe("Órdenes por hora");
    expect(ordersByBucketTitle("month")).toBe("Órdenes por mes");
    expect(pickingSubtitle("week")).toBe("Unidades por semana");
  });
});
