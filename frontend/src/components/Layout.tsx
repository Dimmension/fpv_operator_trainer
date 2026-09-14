import { Activity, History, Radar } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { cn } from "../lib/utils";

export function Layout() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[#07111f]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-17 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="Контур — главная">
            <span className="grid size-10 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-200">
              <Radar className="size-5" />
            </span>
            <span>
              <strong className="block text-sm tracking-[0.2em] text-white uppercase">Контур</strong>
              <span className="hidden text-[11px] text-slate-500 sm:block">FPV Operator Trainer</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Основная навигация">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn("nav-link", isActive && "bg-white/8 text-white")
              }
            >
              <Activity className="size-4" />
              <span className="hidden sm:inline">Модули</span>
            </NavLink>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                cn("nav-link", isActive && "bg-white/8 text-white")
              }
            >
              <History className="size-4" />
              <span className="hidden sm:inline">История</span>
            </NavLink>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" />
            <span className="text-xs text-slate-400">Контур-01</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
