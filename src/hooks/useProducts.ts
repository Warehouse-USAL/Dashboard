import { useQuery } from "@tanstack/react-query";
import { getProducts, type FrontendProduct } from "@/lib/api";
import { stock as mockStock } from "@/lib/dashboard-data";

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
    refetchInterval: 10_000,
    initialData: mockStock.map((s) => ({ ...s })) as FrontendProduct[],
  });
}
