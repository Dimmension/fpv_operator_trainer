import { useQuery } from "@tanstack/react-query";
import { Activity, History, LogOut, Radar } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { api } from "../api/client";
import { cn } from "../lib/utils";
import { ThemeSwitcher } from "./ThemeSwitcher";

export function Layout({ onLogout }: { onLogout?: () => void }) {
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: api.getMe });

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
          
          <div className="flex items-center gap-3">
            {/* Виджет переключения тем для заказчика */}
            <ThemeSwitcher />

            <div className="hidden items-center gap-2 md:flex border-l border-white/10 pl-3">
              <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" />
              <span className="text-xs text-slate-300">
                {user?.callsign ? `${user.callsign} (${user.name})` : user?.name || "Оператор"}
              </span>
            </div>
            {onLogout && (
              <button 
                onClick={onLogout} 
                title="Выйти из системы"
                className="flex items-center justify-center rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
              >
                <LogOut className="size-4" />
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}