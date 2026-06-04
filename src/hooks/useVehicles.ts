import { useQuery } from "@tanstack/react-query";
import { getVehicles } from "@/lib/api";
import { initialRovers } from "@/lib/dashboard-data";

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: getVehicles,
    refetchInterval: 10_000,
    initialData: initialRovers.map((r) => ({ ...r })),
  });
}
