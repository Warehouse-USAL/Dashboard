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

/**
 * La tabla "Cola de órdenes" — la primera de la página, Histórico renderiza
 * después. Todo lo que estos tests verifican es específico de Cola, así que
 * se scopea acá: desde que Histórico dejó de ser mock y muestra órdenes
 * reales, el mismo id/estado puede aparecer en las dos tablas a la vez (son
 * la misma orden), y una query sin acotar por la página entera puede
 * matchear ambas o, peor, dar un falso negativo en un `queryByText` porque
 * Histórico —que no comparte ni búsqueda ni tabs con Cola— sigue mostrando
 * la fila que Cola ya filtró.
 */
function colaTable() {
  return screen.getAllByRole("table")[0];
}

/** La fila de la tabla "Cola de órdenes" que corresponde a una orden. */
function rowOf(orderId: string) {
  return within(colaTable()).getByText(orderId).closest("tr") as HTMLElement;
}

describe("Órdenes — integración con el backend mockeado (MSW)", () => {
  it("reemplaza los datos mock iniciales por las órdenes que devuelve el backend", async () => {
    renderPage();

    // useOrders() arranca con initialData mock (OR-125xx) y recién después
    // llega la respuesta real; por eso findBy (asíncrono) y no getBy.
    expect(await within(colaTable()).findByText("ORD-1001")).toBeInTheDocument();
    expect(within(colaTable()).getByText("ORD-1002")).toBeInTheDocument();

    // OR-12504 es el fallback mock de useOrders(); no depende de Histórico
    // (que ya no tiene ningún id inventado), así que no hace falta acotar.
    expect(screen.queryByText("OR-12504")).not.toBeInTheDocument();
  });

  it("mapea los campos del backend a las columnas de la tabla", async () => {
    renderPage();
    await within(colaTable()).findByText("ORD-1001");

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
    await within(colaTable()).findByText("ORD-1002");

    expect(within(rowOf("ORD-1002")).getByText("—")).toBeInTheDocument();
  });

  it("el buscador filtra la tabla en vivo", async () => {
    renderPage();
    await within(colaTable()).findByText("ORD-1001");

    await userEvent.type(screen.getByPlaceholderText("Buscar..."), "ORD-1001");

    expect(within(colaTable()).getByText("ORD-1001")).toBeInTheDocument();
    expect(within(colaTable()).queryByText("ORD-1002")).not.toBeInTheDocument();
  });

  it("el buscador también matchea por producto, no solo por id", async () => {
    renderPage();
    await within(colaTable()).findByText("ORD-1001");

    await userEvent.type(screen.getByPlaceholderText("Buscar..."), "SKU-B441");

    expect(within(colaTable()).getByText("ORD-1002")).toBeInTheDocument();
    expect(within(colaTable()).queryByText("ORD-1001")).not.toBeInTheDocument();
  });

  it("sin resultados muestra el mensaje de tabla vacía", async () => {
    renderPage();
    await within(colaTable()).findByText("ORD-1001");

    await userEvent.type(screen.getByPlaceholderText("Buscar..."), "no-existe");

    // Texto propio de Cola — el de Histórico es "Sin registros para el rango
    // seleccionado", así que esto ya es inequívoco sin acotar.
    expect(screen.getByText("Sin órdenes para los filtros seleccionados")).toBeInTheDocument();
  });

  it("la pestaña 'Pending' deja solo las órdenes en espera", async () => {
    renderPage();
    await within(colaTable()).findByText("ORD-1001");

    await userEvent.click(screen.getByRole("button", { name: "Pending" }));

    expect(within(colaTable()).getByText("ORD-1002")).toBeInTheDocument();
    expect(within(colaTable()).queryByText("ORD-1001")).not.toBeInTheDocument();
  });

  it("una orden multiproducto muestra un botón con la cantidad y el popup lista todos sus productos", async () => {
    renderPage();
    await within(colaTable()).findByText("ORD-MULTI");

    const row = rowOf("ORD-MULTI");
    // Cant. es el total de unidades de la orden: 4 + 3 + 1.
    expect(within(row).getByText("×8")).toBeInTheDocument();

    await userEvent.click(
      within(row).getByRole("button", { name: "Ver los 3 productos de la orden ORD-MULTI" }),
    );

    // Sin nombre en el catálogo del test, el popup cae al SKU (aparece en las dos columnas).
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByText("SKU-M1").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("SKU-M2").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("SKU-M3").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("×4")).toBeInTheDocument();
  });

  it("una orden de un solo producto no muestra el botón de productos", async () => {
    renderPage();
    await within(colaTable()).findByText("ORD-1002");

    expect(
      within(rowOf("ORD-1002")).queryByRole("button", { name: /Ver los \d+ productos/ }),
    ).not.toBeInTheDocument();
  });

  it("el buscador también encuentra una orden por cualquiera de sus productos", async () => {
    renderPage();
    await within(colaTable()).findByText("ORD-MULTI");

    // SKU-M3 es el tercer producto de ORD-MULTI, no el primero.
    await userEvent.type(screen.getByPlaceholderText("Buscar..."), "SKU-M3");

    expect(within(colaTable()).getByText("ORD-MULTI")).toBeInTheDocument();
    expect(within(colaTable()).queryByText("ORD-1002")).not.toBeInTheDocument();
  });

  it("muestra la adopción de recomendaciones con los conteos del backend", async () => {
    renderPage();

    // Totales de suggestionConversionBuckets: 9/33 pedidos, 12/71 productos, 25/164 unidades.
    expect(await screen.findByText("9 de 33 pedidos")).toBeInTheDocument();
    expect(screen.getByText("12 de 71 productos pedidos")).toBeInTheDocument();
    expect(screen.getByText("25 de 164 unidades")).toBeInTheDocument();
    expect(screen.getByText("27,3%")).toBeInTheDocument();
    expect(screen.getByText("16,9%")).toBeInTheDocument();
    expect(screen.getByText("15,2%")).toBeInTheDocument();
  });

  it("una orden activa enterrada más allá de la página 0 de GET /orders igual aparece en Cola", async () => {
    renderPage();

    // ORD-BURIED-ACTIVE está en la posición 55 del fixture (54 filas de ruido
    // completed antes). GET /orders sin status (page 0, size 50) nunca la trae
    // — el bug real. Cola usa useActiveOrders(), que pide status=pending aparte
    // y ahí es la orden #2 (junto con ORD-1002), sin ningún tope de por medio.
    expect(await within(colaTable()).findByText("ORD-BURIED-ACTIVE")).toBeInTheDocument();
  });
});
