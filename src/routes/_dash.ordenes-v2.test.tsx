import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect } from "vitest";
import { OrdenesPage } from "./_dash.ordenes-v2";

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OrdenesPage />
    </QueryClientProvider>,
  );
}

/** La fila de la tabla "Cola de órdenes" que corresponde a una orden. */
function rowOf(orderId: string) {
  return screen.getByText(orderId).closest("tr") as HTMLElement;
}

describe("Órdenes — integración con el backend mockeado (MSW)", () => {
  it("reemplaza los datos mock iniciales por las órdenes que devuelve el backend", async () => {
    renderPage();

    // useOrders() arranca con initialData mock (OR-125xx) y recién después
    // llega la respuesta real; por eso findBy (asíncrono) y no getBy.
    expect(await screen.findByText("ORD-1001")).toBeInTheDocument();
    expect(screen.getByText("ORD-1002")).toBeInTheDocument();

    expect(screen.queryByText("OR-12504")).not.toBeInTheDocument();
  });

  it("mapea los campos del backend a las columnas de la tabla", async () => {
    renderPage();
    await screen.findByText("ORD-1001");

    const row = rowOf("ORD-1001");
    // items[0].sku -> columna Producto
    expect(within(row).getByText("SKU-A102")).toBeInTheDocument();
    // items[0].quantity -> columna Cant.
    expect(within(row).getByText("×3")).toBeInTheDocument();
    // assigned_vehicle_id -> columna Rover
    expect(within(row).getByText("VHC-001")).toBeInTheDocument();
    // status "in_progress" del backend -> badge "In Progress"
    expect(within(row).getByText("In Progress")).toBeInTheDocument();
  });

  it("una orden sin vehículo asignado muestra '—' en vez de vacío", async () => {
    renderPage();
    await screen.findByText("ORD-1002");

    expect(within(rowOf("ORD-1002")).getByText("—")).toBeInTheDocument();
  });

  it("el buscador filtra la tabla en vivo", async () => {
    renderPage();
    await screen.findByText("ORD-1001");

    await userEvent.type(screen.getByPlaceholderText("Buscar..."), "ORD-1001");

    expect(screen.getByText("ORD-1001")).toBeInTheDocument();
    expect(screen.queryByText("ORD-1002")).not.toBeInTheDocument();
  });

  it("el buscador también matchea por producto, no solo por id", async () => {
    renderPage();
    await screen.findByText("ORD-1001");

    await userEvent.type(screen.getByPlaceholderText("Buscar..."), "SKU-B441");

    expect(screen.getByText("ORD-1002")).toBeInTheDocument();
    expect(screen.queryByText("ORD-1001")).not.toBeInTheDocument();
  });

  it("sin resultados muestra el mensaje de tabla vacía", async () => {
    renderPage();
    await screen.findByText("ORD-1001");

    await userEvent.type(screen.getByPlaceholderText("Buscar..."), "no-existe");

    expect(screen.getByText("Sin órdenes para los filtros seleccionados")).toBeInTheDocument();
  });

  it("la pestaña 'Pending' deja solo las órdenes en espera", async () => {
    renderPage();
    await screen.findByText("ORD-1001");

    await userEvent.click(screen.getByRole("button", { name: "Pending" }));

    expect(screen.getByText("ORD-1002")).toBeInTheDocument();
    expect(screen.queryByText("ORD-1001")).not.toBeInTheDocument();
  });
});
