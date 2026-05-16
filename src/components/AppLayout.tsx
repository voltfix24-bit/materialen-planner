import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import terrevoltLogo from "@/assets/terrevolt-logo.png";

const nav = [
  { to: "/", label: "Dashboard" },
  { to: "/articles", label: "Artikelbestand" },
  { to: "/liander", label: "Liander Assortiment" },
  { to: "/templates", label: "Templates" },
];

export function AppLayout() {
  const { location } = useRouterState();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-6">
          <Link to="/" className="text-base font-semibold tracking-tight">
            Werkvoorbereiding
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {nav.map((n) => {
              const active =
                n.to === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    active && "bg-slate-900 text-white hover:bg-slate-900 hover:text-white",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto text-xs text-slate-400">v1 — interne tool</div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <Outlet />
      </main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
