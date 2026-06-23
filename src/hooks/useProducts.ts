import { useQuery } from "@tanstack/react-query";
import { getProducts, type FrontendProduct } from "@/lib/api";
import { stock as mockStock } from "@/lib/dashboard-data";

const INITIAL_PRODUCTS: FrontendProduct[] = mockStock.map((s) => ({
  sku: s.sku,
  name: s.name,
  zone: s.zone,
  available: s.available,
  reserved: 0,
  minimum: 0,
  priceCents: 0,
  currency: "ARS",
  status: s.status as FrontendProduct["status"],
}));

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
    refetchInterval: 10_000,
    initialData: INITIAL_PRODUCTS,
  });
}
