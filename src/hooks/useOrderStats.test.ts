import { describe, expect, it } from "vitest";
import { formatBucketLabel } from "./useOrderStats";

describe("formatBucketLabel", () => {
  it("recorta la hora de un bucket horario", () => {
    expect(formatBucketLabel("2026-08-01T19:00:00", "hour")).toBe("19:00");
  });

  it("un bucket diario se lee día/mes sin pasar por Date", () => {
    // "2026-08-01" sin componente de hora se interpreta como medianoche UTC.
    // Convertida a hora de Buenos Aires (UTC-3) cae en 31/07, un día antes del
    // que pidió el backend. Por eso se recorta como texto, no se parsea.
    expect(formatBucketLabel("2026-08-01", "day")).toBe("01/08");
  });

  it("no se corre de día ni en el cambio de mes", () => {
    expect(formatBucketLabel("2026-09-01", "day")).toBe("01/09");
  });
});
