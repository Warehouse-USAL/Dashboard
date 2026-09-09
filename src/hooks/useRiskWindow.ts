import { useEffect, useState } from "react";

const STORAGE_KEY = "inventario:risk-window-days";

export const DEFAULT_RISK_WINDOW_DAYS = 30;

export const RISK_WINDOW_OPTIONS = [7, 14, 30, 60, 90] as const;

function readStoredValue(): number {
  if (typeof window === "undefined") return DEFAULT_RISK_WINDOW_DAYS;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RISK_WINDOW_DAYS;
}

/**
 * Ventana (en días) usada para calcular la demanda/cobertura que decide el
 * estado de riesgo de stock (riesgo/dead) — deliberadamente separada del
 * selector de período de Inventario/Órdenes/Vehículos, que es para explorar
 * datos, no para alertar. Ver useInventoryMetrics.
 */
export function useRiskWindow() {
  const [days, setDays] = useState<number>(readStoredValue);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(days));
  }, [days]);

  return [days, setDays] as const;
}
