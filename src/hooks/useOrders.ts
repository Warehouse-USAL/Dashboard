import { useQuery } from "@tanstack/react-query";
import { getOrders, type FrontendOrder } from "@/lib/api";
import { orders as mockOrders } from "@/lib/dashboard-data";

export function useOrders(status?: string) {
  return useQuery({
    queryKey: ["orders", status],
    queryFn: () => getOrders(status),
    refetchInterval: 10_000,
    initialData: mockOrders.map((o) => ({ ...o })) as FrontendOrder[],
  });
}
