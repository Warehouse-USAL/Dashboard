import { describe, it, expect } from "vitest";
import { batteryTone } from "./dashboard-data";

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