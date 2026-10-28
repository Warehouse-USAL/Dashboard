import { afterEach, describe, expect, it, vi } from "vitest";
import { loadMonitoreoUrl, parseMonitoreoUrl } from "./monitoreo-config";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stubConfigJson(body: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }));
}

describe("parseMonitoreoUrl", () => {
  it("acepta http y https", () => {
    expect(parseMonitoreoUrl("http://192.168.0.13:8080/")).toBe("http://192.168.0.13:8080/");
    expect(parseMonitoreoUrl(" https://monitoreo.usal.edu/ ")).toBe("https://monitoreo.usal.edu/");
  });

  it("rechaza vacío, no-string, URL inválida y otros esquemas", () => {
    expect(parseMonitoreoUrl("")).toBeNull();
    expect(parseMonitoreoUrl("   ")).toBeNull();
    expect(parseMonitoreoUrl(undefined)).toBeNull();
    expect(parseMonitoreoUrl("no es una url")).toBeNull();
    expect(parseMonitoreoUrl("javascript:alert(1)")).toBeNull();
    expect(parseMonitoreoUrl("ftp://host/")).toBeNull();
  });
});

describe("loadMonitoreoUrl", () => {
  it("usa la URL de config.json (la que escribe el entrypoint del servidor)", async () => {
    stubConfigJson({ monitoreoUrl: "http://192.168.0.13:8080/" });
    expect(await loadMonitoreoUrl()).toBe("http://192.168.0.13:8080/");
  });

  it("si config.json trae la URL vacía, cae a VITE_MONITOREO_URL", async () => {
    stubConfigJson({ monitoreoUrl: "" });
    vi.stubEnv("VITE_MONITOREO_URL", "http://localhost:9999/");
    expect(await loadMonitoreoUrl()).toBe("http://localhost:9999/");
  });

  it("si no hay config.json (dev) o no es JSON, cae a VITE_MONITOREO_URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new SyntaxError("no es JSON")));
    vi.stubEnv("VITE_MONITOREO_URL", "http://localhost:9999/");
    expect(await loadMonitoreoUrl()).toBe("http://localhost:9999/");
  });

  it("devuelve null si no hay URL en ningún lado", async () => {
    stubConfigJson({ monitoreoUrl: "" });
    vi.stubEnv("VITE_MONITOREO_URL", "");
    expect(await loadMonitoreoUrl()).toBeNull();
  });
});
