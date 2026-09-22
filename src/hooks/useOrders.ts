import { useQuery } from "@tanstack/react-query";
import { getActiveOrders, getOrders, type FrontendOrder } from "@/lib/api";
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
