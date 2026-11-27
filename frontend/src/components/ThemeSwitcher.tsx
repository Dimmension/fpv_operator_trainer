import { Palette, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { THEMES, useTheme } from "../context/ThemeContext";

export function ThemeSwitcher() {
  const { currentTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const active = THEMES.find((t) => t.id === currentTheme);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 rounded-full border border-current/20 bg-black/5 dark:bg-white/5 px-3.5 py-1.5 text-xs font-semibold backdrop-blur-md transition hover:scale-105 active:scale-95"
      >
        <Palette className="size-4" />
        <span className="hidden sm:inline">{active?.title}</span>
        <div className="flex gap-1">
          {active?.palette.map((c, i) => (
            <span key={i} className="size-2 rounded-full border border-black/10" style={{ backgroundColor: c }} />
          ))}
        </div>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2.5 w-64 rounded-2xl border border-black/10 dark:border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur-2xl z-50 animate-[rise_.2s_ease-out]">
          <div className="px-3 py-1.5 text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Дизайн-система проекта
          </div>
          <div className="flex flex-col gap-1 mt-1">
            {THEMES.map((theme) => {
              const isSelected = currentTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => {
                    setTheme(theme.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs transition ${
                    isSelected
                      ? "bg-white/15 text-white font-medium shadow-sm"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <div className="flex flex-col text-left">
                    <span className="font-medium text-white">{theme.title}</span>
                    <span className="text-[10px] text-slate-400">{theme.badge}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {theme.palette.map((color, i) => (
                        <span
                          key={i}
                          className="size-2.5 rounded-full border border-black/20"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    {isSelected && <Check className="size-3.5 text-cyan-300" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}