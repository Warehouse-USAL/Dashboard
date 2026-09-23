import { useQuery } from "@tanstack/react-query";
import { getActiveOrders, getOrders, getOrdersInRange, type FrontendOrder } from "@/lib/api";
import { orders as mockOrders } from "@/lib/dashboard-data";

export function useOrders(status?: string) {
  return useQuery({
    queryKey: ["orders", status],
    queryFn: () => getOrders(status),
    refetchInterval: 10_000,
    initialData: mockOrders.map((o) => ({ ...o })) as FrontendOrder[],
  });
}

/**
 * Órdenes activas (pending + in_progress) — ver getActiveOrders() en api.ts
 * para el porqué. queryKey bajo el mismo prefijo "orders" a propósito:
 * useOrderWebSocket() invalida por queryKey:["orders"] en cada evento
 * order.*, y react-query matchea por prefijo — con otro nombre esta query
 * quedaría desincronizada del WS.
 */
export function useActiveOrders() {
  return useQuery({
    queryKey: ["orders", "active"],
    queryFn: getActiveOrders,
    refetchInterval: 10_000,
    // mockOrders ya son todas pending/in_progress ("en espera"/"en proceso"),
    // sirve tal cual como initialData sin filtrar de nuevo.
    initialData: mockOrders.map((o) => ({ ...o })) as FrontendOrder[],
  });
}

/**
 * Histórico de órdenes — todos los estados dentro de un rango de fechas, con
 * paginación real (ver getOrdersInRange() en api.ts). No es LIVE (depende del
 * período elegido), así que el refetch es más relajado que el resto (60s en
 * vez de 10s) — no tiene sentido repetir varias páginas tan seguido para un
 * dato que no cambia salvo que entren órdenes nuevas dentro de esa ventana.
 * queryKey bajo el prefijo "orders" a propósito, mismo motivo que
 * useActiveOrders: para que useOrderWebSocket() la siga invalidando en vivo.
 */
export function useOrdersInRange(fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ["orders", "range", fromISO, toISO],
    queryFn: () => getOrdersInRange(fromISO, toISO),
    refetchInterval: 60_000,
    initialData: mockOrders.map((o) => ({ ...o })) as FrontendOrder[],
  });
}
