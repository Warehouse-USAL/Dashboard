import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PackageSearch, Search } from "lucide-react";
import { Panel, PageHeader } from "@/components/dashboard/Panel";
import { useProducts } from "@/hooks/useProducts";

export const Route = createFileRoute("/_dash/inventario")({
  component: InventarioPage,
  head: () => ({ meta: [{ title: "Inventario · SmartWarehouse" }] }),
});

function InventarioPage() {
  const { data: products } = useProducts();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"todos" | "ok" | "bajo" | "agotado">("todos");

  const filtered = useMemo(
    () =>
      products.filter((s) => {
        if (filter !== "todos" && s.status !== filter) return false;
        if (q && !`${s.sku} ${s.name} ${s.zone}`.toLowerCase().includes(q.toLowerCase()))
          return false;
        return true;
      }),
    [products, q, filter],
  );

  const totals = useMemo(
    () => ({
      bajo: products.filter((s) => s.status === "bajo").length,
      agotado: products.filter((s) => s.status === "agotado").length,
    }),
    [products],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        icon={PackageSearch}
        title="Inventario"
        description="Stock disponible para retiro"
      />

      <div className="grid grid-cols-2 gap-4">
        <Stat label="Stock bajo" value={totals.bajo} accent="warning" />
        <Stat label="Agotados" value={totals.agotado} accent="destructive" />
      </div>

      <Panel
        title="Catálogo"
        subtitle={`${filtered.length} producto${filtered.length === 1 ? "" : "s"}`}
        icon={PackageSearch}
        action={
          <div className="flex gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="px-2 py-1.5 text-xs rounded-md border border-border bg-secondary/40"
            >
              <option value="todos">Todos</option>
              <option value="ok">Disponibles</option>
              <option value="bajo">Stock bajo</option>
              <option value="agotado">Agotados</option>
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar SKU..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-border bg-secondary/40 focus:outline-none focus:border-primary w-40"
              />
            </div>
          </div>
        }
      >
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="text-left font-medium py-2 px-2">SKU</th>
                <th className="text-left font-medium py-2 px-2">Producto</th>
                <th className="text-left font-medium py-2 px-2">Zona</th>
                <th className="text-right font-medium py-2 px-2">Disponible</th>
                <th className="text-left font-medium py-2 px-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.sku} className="border-b border-border/50 hover:bg-secondary/30">
                  <td className="py-3 px-2 text-xs font-mono font-bold">{s.sku}</td>
                  <td className="py-3 px-2 text-xs">{s.name}</td>
                  <td className="py-3 px-2 text-xs text-muted-foreground">{s.zone}</td>
                  <td className="py-3 px-2 text-xs text-right font-semibold">{s.available}</td>
                  <td className="py-3 px-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        s.status === "ok"
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : s.status === "bajo"
                            ? "border-warning/30 bg-warning/10 text-warning"
                            : "border-destructive/30 bg-destructive/10 text-destructive"
                      }`}
                    >
                      {s.status === "ok" ? "disponible" : s.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "warning" | "destructive";
}) {
  const c =
    accent === "warning"
      ? "text-warning"
      : accent === "destructive"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${c}`}>{value}</p>
    </div>
  );
}
