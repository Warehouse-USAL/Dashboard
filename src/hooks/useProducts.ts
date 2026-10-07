import { useQuery } from "@tanstack/react-query";
import { getProducts, type FrontendProduct } from "@/lib/api";
import { stock as mockStock } from "@/lib/dashboard-data";

const INITIAL_PRODUCTS: FrontendProduct[] = mockStock.map((s) => ({
  id: s.sku,
  sku: s.sku,
  name: s.name,
  zone: s.zone,
  available: s.available,
  reserved: 0,
  physical: s.available,
  minimum: 0,
  priceCents: 0,
  currency: "ARS",
  restock: null,
  // Los mocks de dashboard-data siguen usando el vocabulario viejo ("bajo").
  status: s.status === "bajo" ? "a_reponer" : (s.status as FrontendProduct["status"]),
}));

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: () => getProducts(),
    refetchInterval: 10_000,
    initialData: INITIAL_PRODUCTS,
  });
}
