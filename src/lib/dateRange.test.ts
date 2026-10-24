import { describe, it, expect, vi, afterEach } from "vitest";
import { periodToBounds, withinBounds } from "./dateRange";

describe("periodToBounds", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("'24h' devuelve una ventana de exactamente 24 horas terminando ahora", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T12:00:00Z"));

    const { from, to } = periodToBounds("24h");

    expect(to).toBe(Date.now());
    expect(to - from).toBe(24 * 60 * 60 * 1000);
  });
});

describe("withinBounds", () => {
  const bounds = { from: 1000, to: 2000 };

  it("devuelve false si la fecha no vino (undefined)", () => {
    expect(withinBounds(undefined, bounds)).toBe(false);
  });

  it("devuelve false si la fecha es un string inválido, en vez de explotar", () => {
    expect(withinBounds("no-es-una-fecha", bounds)).toBe(false);
  });

  it("los límites from/to son inclusive", () => {
    expect(withinBounds(new Date(bounds.from).toISOString(), bounds)).toBe(true);
    expect(withinBounds(new Date(bounds.to).toISOString(), bounds)).toBe(true);
  });

  it("devuelve false apenas afuera de los límites", () => {
    expect(withinBounds(new Date(bounds.from - 1).toISOString(), bounds)).toBe(false);
    expect(withinBounds(new Date(bounds.to + 1).toISOString(), bounds)).toBe(false);
  });
});
