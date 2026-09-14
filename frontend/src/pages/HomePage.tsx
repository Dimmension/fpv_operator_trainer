import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Eye, ScanSearch, Timer, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { ErrorNotice } from "../components/ErrorNotice";
import { LoadingState } from "../components/LoadingState";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";

const moduleMeta = {
  "sequential-search": {
    href: "/modules/attention",
    icon: ScanSearch,
    marker: "01",
  },
  "visual-memory": {
    href: "/modules/memory",
    icon: Eye,
    marker: "02",
  },
} as const;

function moduleFacts(code: string, config: Record<string, unknown>): [string, string] {
  if (code === "sequential-search") {
    const minimum = Number(config.min_number ?? 1);
    const maximum = Number(config.max_number ?? 100);
    const minutes = Number(config.time_limit_ms ?? 300_000) / 60_000;
    const time = Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
    return [`${maximum - minimum + 1} чисел`, `${time} мин.`];
  }
  const rounds = Number(config.round_count ?? 1);
  const rows = Number(config.grid_rows ?? 5);
  const columns = Number(config.grid_columns ?? 5);
  return [`${rounds} раунд`, `${rows} × ${columns}`];
}

export function HomePage() {
  const modules = useQuery({ queryKey: ["modules"], queryFn: api.modules });

  if (modules.isLoading) return <LoadingState />;

  return (
    <div>
      {modules.error && <ErrorNotice message="Не удалось загрузить модули. Проверьте подключение к API." />}

      <section aria-labelledby="modules-heading">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="eyebrow">Рабочая программа</p>
            <h2 id="modules-heading" className="mt-1 text-2xl font-semibold text-white">
              Диагностические модули
            </h2>
          </div>
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link to="/history">
              История <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {modules.data?.map((module) => {
            const meta = moduleMeta[module.code as keyof typeof moduleMeta];
            if (!meta) return null;
            const Icon = meta.icon;
            const [metric, time] = moduleFacts(
              module.code,
              module.config as Record<string, unknown>,
            );
            return (
              <Card key={module.code} className="group relative overflow-hidden p-6 sm:p-8">
                <span className="absolute top-5 right-6 font-mono text-5xl font-semibold text-white/[0.035]">
                  {meta.marker}
                </span>
                <div className="mb-7 grid size-12 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/8 text-cyan-200 transition group-hover:bg-cyan-300/12">
                  <Icon className="size-6" />
                </div>
                <p className="text-xs font-semibold tracking-[0.18em] text-cyan-300/75 uppercase">
                  Модуль {meta.marker}
                </p>
                <h3 className="mt-3 max-w-md text-2xl font-semibold text-white">{module.title}</h3>
                <p className="mt-3 min-h-12 max-w-lg text-sm leading-6 text-slate-400">
                  {module.description}
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-4 border-t border-white/8 pt-5 text-xs text-slate-400">
                  <span className="flex items-center gap-2">
                    <Trophy className="size-4 text-slate-500" /> {metric}
                  </span>
                  <span className="flex items-center gap-2">
                    <Timer className="size-4 text-slate-500" /> {time}
                  </span>
                  {module.active_attempt_id ? (
                    <span className="ml-auto text-cyan-200">
                      Сохранено: {module.active_progress} / {module.active_progress_total}
                    </span>
                  ) : module.completed_attempts > 0 ? (
                    <span className="ml-auto text-emerald-300">
                      Пройдено: {module.completed_attempts}
                    </span>
                  ) : null}
                </div>
                {module.active_attempt_id && (
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/6">
                    <div
                      className="h-full rounded-full bg-cyan-300 transition-[width]"
                      style={{
                        width: `${Math.round(
                          ((module.active_progress ?? 0) /
                            Math.max(module.active_progress_total ?? 1, 1)) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>
                )}
                <Button asChild size="lg" className="mt-6 w-full sm:w-auto">
                  <Link to={meta.href}>
                    {module.active_attempt_id ? "Продолжить" : "Начать тест"}{" "}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
