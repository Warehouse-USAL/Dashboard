import { describe, expect, it } from "vitest";
import {
  MAX_METRICS_WINDOW_DAYS,
  avgPoints,
  byLabel,
  formatDuration,
  metricsWindow,
  mtbfSeconds,
  mttrSeconds,
  sumPoints,
  type Series,
} from "./metrics-api";

const series = (points: Array<[number, number]>, labels: Record<string, string> = {}): Series => ({
  labels,
  points,
});

describe("sumPoints / avgPoints", () => {
  it("suma los valores ignorando los timestamps", () => {
    expect(
      sumPoints(
        series([
          [100, 1],
          [200, 2],
          [300, 3],
        ]),
      ),
    ).toBe(6);
  });

  it("una serie vacía promedia 0 y no divide por cero", () => {
    expect(avgPoints(series([]))).toBe(0);
  });

  it("el promedio de la fracción en ERROR queda entre 0 y 1", () => {
    // Es la forma que tiene wh.vehicle.state con agg avg: 1 si el rover estaba
    // en ese estado, 0 si no.
    const fraction = avgPoints(
      series([
        [100, 1],
        [200, 0],
        [300, 0],
        [400, 0],
      ]),
    );
    expect(fraction).toBeCloseTo(0.25);
  });
});

describe("mtbfSeconds", () => {
  it("divide la ventana por la cantidad de fallas", () => {
    // 24 h con 3 fallas -> una cada 8 h
    expect(mtbfSeconds(3, 86_400)).toBe(28_800);
  });

  it("devuelve null cuando no hubo fallas, no 0 ni Infinity", () => {
    // Un rover que no falló no tiene un MTBF de cero: no tiene MTBF. Devolver 0
    // lo mostraría como el peor de la flota, que es lo contrario de la verdad.
    expect(mtbfSeconds(0, 86_400)).toBeNull();
  });
});

describe("mttrSeconds", () => {
  it("reparte el tiempo total en ERROR entre las fallas", () => {
    // 10 % de una ventana de 24 h en ERROR, repartido en 2 fallas -> 1.2 h c/u
    expect(mttrSeconds(2, 0.1, 86_400)).toBeCloseTo(4_320);
  });

  it("devuelve null sin fallas aunque la fracción sea > 0", () => {
    expect(mttrSeconds(0, 0.5, 86_400)).toBeNull();
  });

  it("da 0 si el rover falló pero nunca estuvo en ERROR al muestrear", () => {
    // Puede pasar con step grueso: la transición se contó pero el gauge no
    // llegó a muestrear el estado. 0 es correcto acá; null significaría "no
    // falló", que sería falso.
    expect(mttrSeconds(1, 0, 86_400)).toBe(0);
  });
});

describe("metricsWindow", () => {
  const now = Date.UTC(2026, 8, 6, 12, 0, 0);

  it("no toca una ventana que entra en la retención", () => {
    const w = metricsWindow({ from: now - 7 * 86_400_000, to: now });
    expect(w.clamped).toBe(false);
    expect(w.seconds).toBe(7 * 86_400);
  });

  it("recorta a 30 días una ventana de 90 y lo avisa", () => {
    // El tope es por consulta (MAX_RANGE = 31 días), no por historia: la
    // retención es de ~400 días. Los datos están, pero no entran en una sola
    // llamada — sin recortar el backend contesta QUERY_TOO_BROAD y el panel
    // queda vacío en vez de mostrar 30 días.
    const w = metricsWindow({ from: now - 90 * 86_400_000, to: now });
    expect(w.clamped).toBe(true);
    expect(w.seconds).toBe(MAX_METRICS_WINDOW_DAYS * 86_400);
  });

  it("emite ISO 8601, que es lo que el backend parsea", () => {
    const w = metricsWindow({ from: now - 3_600_000, to: now });
    expect(w.to).toBe("2026-09-06T12:00:00.000Z");
  });
});

describe("byLabel", () => {
  it("indexa por la etiqueta pedida y descarta las series que no la traen", () => {
    const map = byLabel(
      [
        series([[1, 1]], { vehicle_id: "VHC-001" }),
        series([[1, 2]], { vehicle_id: "VHC-002" }),
        series([[1, 3]], {}), // la serie sin group_by, p.ej. el total de flota
      ],
      "vehicle_id",
    );
    expect([...map.keys()]).toEqual(["VHC-001", "VHC-002"]);
  });
});

describe("formatDuration", () => {
  it("elige la unidad según la magnitud", () => {
    expect(formatDuration(175_000)).toBe("48.6 h");
    expect(formatDuration(1_122)).toBe("18.7 min");
    expect(formatDuration(45)).toBe("45 s");
  });

  it("null y valores no finitos se muestran como guión, no como NaN", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(Infinity)).toBe("—");
  });
});
