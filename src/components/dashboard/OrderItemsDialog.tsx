import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type OrderItemRow = { sku: string; name: string; qty: number };

/**
 * Popup con todos los productos de una orden multiproducto.
 *
 * Es un popup y no una fila expandible a propósito: con 10 filas por página,
 * expandir una orden de varios productos agranda y desplaza la tabla, y en el
 * Histórico (10 columnas) la fila expandida queda angosta. El mismo popup sirve
 * en Cola y en Histórico.
 */
export function OrderItemsDialog({
  open,
  onOpenChange,
  orderId,
  badges,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  /** Estado y prioridad de la orden, ya armados por la página. */
  badges?: ReactNode;
  items: OrderItemRow[];
}) {
  const totalUnits = items.reduce((s, it) => s + it.qty, 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Orden {orderId}
            {badges}
          </DialogTitle>
          <DialogDescription>
            {items.length} productos · {totalUnits.toLocaleString("es-AR")} unidades en total
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="text-left font-medium py-2 px-2">Producto</th>
              <th className="text-left font-medium py-2 px-2">SKU</th>
              <th className="text-right font-medium py-2 px-2">Cant.</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={`${it.sku}-${i}`} className="border-b border-border/50">
                <td className="py-2.5 px-2 text-xs font-medium">{it.name}</td>
                <td className="py-2.5 px-2 text-xs text-muted-foreground">{it.sku}</td>
                <td className="py-2.5 px-2 text-xs text-right tabular-nums">×{it.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
