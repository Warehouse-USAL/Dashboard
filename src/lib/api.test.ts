import { describe, it, expect } from "vitest";
import { mapVehicle } from "./api";

describe("mapVehicle", () => {
  it("mapea un vehículo del backend al shape Rover que usa el dashboard", () => {
    const rover = mapVehicle({
      id: "VHC-001",
      name: "Rover-01",
      status: "busy",
      position: { x: 14.2, y: 9.1 },
      battery: 79,
      current_order_id: "ORD-1001",
      last_seen_at: "2026-05-01T10:03:45Z",
    });

    expect(rover).toEqual({
      id: "VHC-001",
      name: "Rover-01",
      state: "busy",
      battery: 79,
      hours: 0,
      order: "ORD-1001",
      zone: "—",
      x: 14.2,
      y: 9.1,
      vx: 0,
      vy: 0,
    });
  });
});