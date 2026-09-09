import { describe, it, expect } from "vitest";
import { mapVehicle, mapOrder, mapOrderPriority } from "./api";

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

describe("mapOrder", () => {
  it("para producto el campo suelto gana, pero para cantidad gana el ítem (prioridades cruzadas)", () => {
    const order = mapOrder({
      id: "ORD-1",
      product: "FLAT-PRODUCT",
      quantity: 99,
      items: [{ productId: "P1", sku: "ITEM-SKU", quantity: 3 }],
    });

    expect(order.product).toBe("FLAT-PRODUCT");
    expect(order.qty).toBe(3);
  });

  it("prioriza assigned_vehicle_id sobre los demás alias de vehículo", () => {
    const order = mapOrder({
      id: "ORD-2",
      assigned_vehicle_id: "VHC-A",
      assignedVehicleId: "VHC-B",
      vehicle_id: "VHC-C",
      rover: "VHC-D",
    });

    expect(order.rover).toBe("VHC-A");
  });

  it("sin ningún dato usa los valores por defecto de producto, cantidad, vehículo, prioridad y estado", () => {
    const order = mapOrder({ id: "ORD-3" });

    expect(order.product).toBe("—");
    expect(order.qty).toBe(1);
    expect(order.rover).toBe("—");
    expect(order.priority).toBe("media");
    expect(order.state).toBe("en espera");
  });

  it("traduce estados conocidos del backend y deja pasar los desconocidos sin traducir", () => {
    expect(mapOrder({ id: "ORD-4", status: "in_progress" }).state).toBe("en proceso");
    expect(mapOrder({ id: "ORD-5", status: "weird_status" }).state).toBe("weird_status");
  });
});

describe("mapOrderPriority", () => {
  // La tabla de Órdenes filtra por un Set de {urgente,alta,media,baja}: una
  // prioridad sin traducir no matchea y la fila desaparece sin ningún error. Por
  // eso esto se testea, y no como cosmética.
  it("traduce las cuatro prioridades del backend", () => {
    expect(mapOrderPriority("low")).toBe("baja");
    expect(mapOrderPriority("medium")).toBe("media");
    expect(mapOrderPriority("high")).toBe("alta");
    expect(mapOrderPriority("urgent")).toBe("urgente");
  });

  it("acepta MAYÚSCULAS, que es como llegan desde /query/orders", () => {
    // GET /orders las serializa en minúsculas con el @JsonValue del enum, pero
    // /query/* lee el documento crudo de Mongo. Las dos grafías son reales.
    expect(mapOrderPriority("URGENT")).toBe("urgente");
    expect(mapOrderPriority("HIGH")).toBe("alta");
  });

  it("las órdenes anteriores al deploy del backend vienen sin prioridad", () => {
    // No hay backfill: leen priority: null. Se muestran como "media", que es
    // además el default del backend para las nuevas.
    expect(mapOrderPriority(null)).toBe("media");
    expect(mapOrderPriority(undefined)).toBe("media");
  });

  it("una prioridad desconocida pasa sin traducir en vez de disfrazarse de media", () => {
    // Si el backend agrega un quinto valor, preferimos verlo crudo en la UI
    // antes que contarlo en silencio como "media".
    expect(mapOrderPriority("CRITICAL")).toBe("critical");
  });
});
