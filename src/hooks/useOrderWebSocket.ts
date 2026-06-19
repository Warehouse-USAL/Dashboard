import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getWsUrl } from "@/lib/api";

export function useOrderWebSocket() {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let destroyed = false;
    async function connect() {
      if (destroyed) return;
      try {
        const url = await getWsUrl("/ws/v1/orders");
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as { event: string };
            if (msg.event?.startsWith("order.")) {
              queryClient.invalidateQueries({ queryKey: ["orders"] });
            }
          } catch { /* ignore malformed */ }
        };
        ws.onclose = () => { if (!destroyed) timerRef.current = setTimeout(connect, 3_000); };
        ws.onerror = () => ws.close();
      } catch { if (!destroyed) timerRef.current = setTimeout(connect, 5_000); }
    }
    connect();
    return () => {
      destroyed = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [queryClient]);
}
