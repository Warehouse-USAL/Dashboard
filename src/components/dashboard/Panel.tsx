import * as React from "react";
import { Maximize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ChartExpandedProvider } from "./ChartBox";

export function Panel({
  title,
  subtitle,
  icon: Icon,
  className = "",
  action,
  expandable = false,
  dense = false,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  action?: React.ReactNode;
  /** Agrega un botón que abre el mismo contenido en un modal grande. */
  expandable?: boolean;
  /** Header más compacto (mb-3, con wrap): el espaciado que tenían los Panel locales de las páginas v2. */
  dense?: boolean;
  /** Función `(expanded) => ...` para ajustar tamaños cuando se ve en el modal. */
  children: React.ReactNode | ((expanded: boolean) => React.ReactNode);
}) {
  const render = (expanded: boolean) =>
    typeof children === "function" ? children(expanded) : children;
  const heading = (inModal: boolean) => {
    const Title = inModal ? DialogTitle : "h2";
    return (
      <div className="flex items-center gap-2.5">
        {Icon && (
          <div className="w-8 h-8 rounded-md bg-secondary/60 flex items-center justify-center text-primary">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div>
          <Title className="text-sm font-bold tracking-tight">{title}</Title>
          {subtitle && (
            <p className={`text-[11px] text-muted-foreground ${dense ? "mt-0.5" : ""}`}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
    );
  };

  const card = (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <div
        className={`flex items-start justify-between gap-2 ${dense ? "mb-3 flex-wrap" : "mb-4"}`}
      >
        {heading(false)}
        {expandable ? (
          <div className="flex items-center gap-2">
            {action}
            <DialogTrigger asChild>
              <button
                type="button"
                aria-label={`Ampliar gráfico: ${title}`}
                title="Ampliar"
                className="p-1.5 rounded-md border border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </DialogTrigger>
          </div>
        ) : (
          action
        )}
      </div>
      {render(false)}
    </div>
  );

  if (!expandable) return card;

  return (
    <Dialog>
      {card}
      {/* Radix no monta el contenido mientras está cerrado: el gráfico del modal
          sólo existe mientras se ve (no usar forceMount). */}
      <DialogContent className="flex flex-col h-[85vh] w-[95vw] max-w-[1200px] gap-4">
        <div className="flex items-start justify-between gap-2 pr-8">
          {heading(true)}
          {action}
        </div>
        <DialogDescription className="sr-only">
          {subtitle ?? `Vista ampliada de ${title}`}
        </DialogDescription>
        <ChartExpandedProvider value={true}>
          <div className="flex-1 min-h-0 flex flex-col overflow-auto">{render(true)}</div>
        </ChartExpandedProvider>
      </DialogContent>
    </Dialog>
  );
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-primary-foreground"
          style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-glow)" }}
        >
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
