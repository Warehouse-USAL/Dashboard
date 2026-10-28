import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MonitoreoVehiculosPage } from "./_dash.monitoreo-vehiculos";
import { loadMonitoreoUrl } from "@/lib/monitoreo-config";

vi.mock("@/lib/monitoreo-config", () => ({ loadMonitoreoUrl: vi.fn() }));

beforeEach(() => {
  vi.mocked(loadMonitoreoUrl).mockReset();
});

describe("Monitoreo vehículos", () => {
  it("embebe la URL configurada en un iframe y ofrece abrirla en otra pestaña", async () => {
    vi.mocked(loadMonitoreoUrl).mockResolvedValue("http://192.168.0.13:8080/");
    render(<MonitoreoVehiculosPage />);

    const frame = await screen.findByTitle("Monitoreo de vehículos");
    expect(frame).toHaveAttribute("src", "http://192.168.0.13:8080/");
    expect(screen.getByRole("link", { name: /abrir en pestaña nueva/i })).toHaveAttribute(
      "href",
      "http://192.168.0.13:8080/",
    );
  });

  it("sin URL configurada muestra el aviso y no renderiza iframe", async () => {
    vi.mocked(loadMonitoreoUrl).mockResolvedValue(null);
    render(<MonitoreoVehiculosPage />);

    expect(await screen.findByText(/todavía no se configuró la url/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Monitoreo de vehículos")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /abrir en pestaña nueva/i })).not.toBeInTheDocument();
  });
});
