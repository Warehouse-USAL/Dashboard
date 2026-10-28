import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExternalLink, Radar } from "lucide-react";
import { PageHeader } from "@/components/dashboard/Panel";
import { loadMonitoreoUrl } from "@/lib/monitoreo-config";

export const Route = createFileRoute("/_dash/monitoreo-vehiculos")({
  component: MonitoreoVehiculosPage,
  head: () => ({ meta: [{ title: "Monitoreo vehículos · SmartWarehouse" }] }),
});

export function MonitoreoVehiculosPage() {
  // undefined = todavía resolviendo; null = no configurada.
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMonitoreoUrl().then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Radar}
        title="Monitoreo vehículos"
        description="Central de rovers (página externa embebida)"
        action={
          url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-xs rounded-md border border-border bg-secondary/50 hover:bg-secondary flex items-center gap-2"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Abrir en pestaña nueva
            </a>
          )
        }
      />

      <div className="relative h-[calc(100vh-15rem)] min-h-[480px] rounded-xl border border-border bg-card/40 overflow-hidden">
        {url === null && (
          <p className="h-full flex items-center justify-center text-center px-6 text-[11px] text-muted-foreground">
            Todavía no se configuró la URL del monitoreo.
          </p>
        )}
        {url && (
          <>
            {!loaded && (
              <p className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
                Cargando monitoreo… Si no aparece, la página solo es accesible desde la red de la
                facultad.
              </p>
            )}
            <iframe
              src={url}
              title="Monitoreo de vehículos"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
            />
          </>
        )}
      </div>
    </div>
  );
}
