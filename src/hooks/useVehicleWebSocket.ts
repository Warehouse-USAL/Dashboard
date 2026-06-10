import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getWsUrl, mapVehicle, type BackendVehicle } from "@/lib/api";
import type { Rover } from "@/lib/dashboard-data";

export function useVehicleWebSocket() {
  const queryClient = useQueryClient();
  const wsRef  = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let destroyed = false;

    async function connect() {
      if (destroyed) return;
      try {
        const url = await getWsUrl();
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as {
              event: string;
              payload: BackendVehicle;
            };
            if (msg.event === "vehicle.updated" || msg.event === "vehicle.error") {
              const updated = mapVehicle(msg.payload);
              queryClient.setQueryData<Rover[]>(["vehicles"], (prev) =>
                prev?.map((v) => (v.id === updated.id ? { ...v, ...updated } : v))
              );
            }
          } catch {
            // ignore malformed messages
          }
        };

        ws.onclose = () => {
          if (!destroyed) timerRef.current = setTimeout(connect, 3_000);
        };

        ws.onerror = () => ws.close();
      } catch {
        if (!destroyed) timerRef.current = setTimeout(connect, 5_000);
      }
    }

    connect();

    return () => {
      destroyed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [queryClient]);
}
