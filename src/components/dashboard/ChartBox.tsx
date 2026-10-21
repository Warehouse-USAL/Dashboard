import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * `true` sólo dentro del modal de un `Panel` expandible. Los gráficos lo leen
 * para agrandar fuentes, barras y márgenes sin duplicar el JSX.
 */
const ChartExpandedContext = React.createContext(false);

export const ChartExpandedProvider = ChartExpandedContext.Provider;

export function useChartExpanded() {
  return React.useContext(ChartExpandedContext);
}

/**
 * Contenedor de un `ResponsiveContainer` (usarlo con `height="100%"`).
 * En la página mide `height` px; en el modal ocupa el alto que sobra, porque
 * el cuerpo del modal es flex-col con altura definida.
 */
export function ChartBox({
  height,
  className,
  children,
}: {
  height: number;
  className?: string;
  children: React.ReactNode;
}) {
  const expanded = useChartExpanded();
  return (
    <div
      className={cn("w-full", expanded && "flex-1 min-h-[320px]", className)}
      style={expanded ? undefined : { height }}
    >
      {children}
    </div>
  );
}
