import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bell,
  CircuitBoard,
  LayoutDashboard,
  ListChecks,
  PackageSearch,
  Settings,
  Truck,
} from "lucide-react";
import { alerts } from "@/lib/dashboard-data";
import logoUrl from "@/assets/smartwarehouse-logo.png";
import { useInventoryWebSocket } from "@/hooks/useInventoryWebSocket";
import { useVehicleWebSocket } from "@/hooks/useVehicleWebSocket";
import { useOrderWebSocket } from "@/hooks/useOrderWebSocket";

export const Route = createFileRoute("/_dash")({
  component: DashLayout,
});

const nav = [
  { to: "/home", icon: LayoutDashboard, label: "Home" },
  { to: "/ordenes-v2", icon: ListChecks, label: "Órdenes" },
  { to: "/vehiculos-v2", icon: Truck, label: "Vehículos" },
  { to: "/inventario", icon: PackageSearch, label: "Inventario" },
  { to: "/alertas", icon: Bell, label: "Alertas", badge: alerts.length },
  { to: "/configuracion", icon: Settings, label: "Configuración" },
] as const;

function DashLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [now, setNow] = useState<string>("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  useInventoryWebSocket();
  useVehicleWebSocket();
  useOrderWebSocket();

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString("es-AR"));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside
        className={`${mobileNavOpen ? "fixed inset-y-0 left-0 z-40 flex" : "hidden"} lg:flex w-60 shrink-0 border-r border-border bg-card/80 backdrop-blur flex-col`}
      >
        <div className="p-5 border-b border-border flex items-center gap-3">
          <img src={logoUrl} alt="SmartWarehouse" className="h-8 w-auto" />
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Grupo 3 · v1.0
          </p>
        </div>
        <nav className="p-3 space-y-1 flex-1">
          {nav.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileNavOpen(false)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  active
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-transparent"
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span className="flex-1 text-left">{item.label}</span>
                {"badge" in item && item.badge && (
                  <span className="text-[10px] bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-border bg-card/30 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNavOpen((o) => !o)}
              className="lg:hidden w-9 h-9 rounded-md border border-border bg-secondary/50 flex items-center justify-center"
              aria-label="menu"
            >
              <CircuitBoard className="w-4 h-4" />
            </button>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                SmartWarehouse · Monitor
              </p>
              <h2 className="text-sm font-semibold">
                {nav.find((n) => n.to === pathname)?.label ?? "Panel"}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div
              suppressHydrationWarning
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary/50 border border-border text-xs"
            >
              <span className="relative flex w-2 h-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              EN VIVO · {now || "--:--:--"}
            </div>
            <Link
              to="/alertas"
              className="relative w-9 h-9 rounded-md border border-border bg-secondary/50 hover:bg-secondary flex items-center justify-center"
              aria-label="alertas"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 w-4 h-4 text-[10px] bg-destructive text-destructive-foreground rounded-full flex items-center justify-center font-bold">
                {alerts.length}
              </span>
            </Link>
            <div className="w-9 h-9 rounded-md bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground text-sm font-bold">
              OP
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 space-y-6 overflow-auto">
          <Outlet />
          <footer className="text-center text-[11px] text-muted-foreground pt-2">
            SmartWarehouse · Grupo 3 — Dashboard de Monitoreo · Hito 1 · v1.0
          </footer>
        </main>
      </div>
    </div>
  );
}