import { describe, it, expect, vi } from "vitest";
import {
  batteryTone,
  alertTone,
  useLiveRovers,
} from "./dashboard-data";
import { act, renderHook } from "@testing-library/react";

describe("batteryTone", () => {
  it("devuelve 'bajo' para batería crítica", () => {
    expect(batteryTone(10).label).toBe("bajo");
  });

  it("el límite 24 todavía es 'bajo'", () => {
    expect(batteryTone(24).label).toBe("bajo");
  });

  it("el límite 25 ya pasa a ser 'normal', no 'bajo'", () => {
    expect(batteryTone(25).label).toBe("normal");
  });

  it("devuelve 'normal' para batería media", () => {
    expect(batteryTone(40).label).toBe("normal");
  });

  it("el límite 59 todavía es 'normal'", () => {
    expect(batteryTone(59).label).toBe("normal");
  });

  it("el límite 60 ya pasa a ser 'óptimo', no 'normal'", () => {
    expect(batteryTone(60).label).toBe("óptimo");
  });

  it("devuelve 'óptimo' para batería alta", () => {
    expect(batteryTone(100).label).toBe("óptimo");
  });
});

describe("alertTone", () => {
  it("devuelve el estilo crítico", () => {
    expect(alertTone("critical")).toBe(
      "border-destructive/40 bg-destructive/10 text-destructive",
    );
  });

  it("devuelve el estilo de warning", () => {
    expect(alertTone("warning")).toBe(
      "border-warning/40 bg-warning/10 text-warning",
    );
  });

  it("usa el estilo informativo para niveles desconocidos", () => {
    expect(alertTone("info")).toBe(
      "border-primary/30 bg-primary/10 text-primary",
    );
  });
});
describe("useLiveRovers", () => {
  it("mueve los rovers ocupados y reduce su batería con el paso del tiempo", () => {
  vi.useFakeTimers();

  const { result, unmount } = renderHook(() => useLiveRovers());

  const initial = result.current.map((r) => ({ ...r }));

  act(() => {
    vi.advanceTimersByTime(120);
  });

  const updated = result.current;

  const initialBusy = initial.find((r) => r.id === "R-01")!;
  const updatedBusy = updated.find((r) => r.id === "R-01")!;

  expect(updatedBusy.x).toBe(initialBusy.x + initialBusy.vx);
  expect(updatedBusy.battery).toBeCloseTo(initialBusy.battery - 0.05);

  const initialIdle = initial.find((r) => r.id === "R-03")!;
  const updatedIdle = updated.find((r) => r.id === "R-03")!;

  expect(updatedIdle.x).toBe(initialIdle.x);
  expect(updatedIdle.y).toBe(initialIdle.y);
  expect(updatedIdle.battery).toBe(initialIdle.battery);

  unmount();
  vi.useRealTimers();
});
});