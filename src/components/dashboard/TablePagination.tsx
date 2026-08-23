import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function TablePagination({
  page,
  totalPages,
  onPageChange,
  from,
  to,
  total,
  itemLabel = "resultados",
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  from: number;
  to: number;
  total: number;
  itemLabel?: string;
}) {
  if (total === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 pt-3 mt-2 border-t border-border flex-wrap">
      <p className="text-[11px] text-muted-foreground">
        {from}–{to} de {total} {itemLabel}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border bg-secondary/40 hover:bg-secondary/60 disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft className="w-3 h-3" /> Anterior
        </button>
        {pageWindow(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`e-${i}`} className="px-1.5 text-[11px] text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "min-w-[26px] px-1.5 py-1 text-[11px] rounded-md border tabular-nums",
                p === page
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border bg-secondary/40 hover:bg-secondary/60 text-muted-foreground",
              )}
            >
              {p + 1}
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border bg-secondary/40 hover:bg-secondary/60 disabled:opacity-40 disabled:pointer-events-none"
        >
          Siguiente <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

/** Page-number window with ellipsis: first, last, current ±1. */
function pageWindow(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const keep = new Set<number>([0, total - 1, current, current - 1, current + 1]);
  const sorted = [...keep].filter((p) => p >= 0 && p < total).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}
