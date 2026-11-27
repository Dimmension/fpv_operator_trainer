import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarDays, Timer } from "lucide-react";
import { Link } from "react-router-dom";

import { api } from "../api/client";
import { ErrorNotice } from "../components/ErrorNotice";
import { LoadingState } from "../components/LoadingState";
import { Card } from "../components/ui/card";
import { formatDate, formatDuration } from "../lib/utils";

export function HistoryPage() {
  const history = useQuery({ queryKey: ["history"], queryFn: api.history });
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: api.getMe });

  if (history.isLoading) return <LoadingState label="Загрузка истории" />;
  if (history.error) return <ErrorNotice message="Не удалось загрузить историю результатов." />;

  return (
    <section className="mx-auto max-w-5xl">
      <p className="eyebrow">{user?.callsign || user?.name || "Оператор"}</p>
      <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">История результатов</h1>
      <p className="mt-3 text-slate-400">Последние завершённые и прерванные попытки.</p>

      {!history.data?.length ? (
        <Card className="mt-8 grid min-h-64 place-items-center p-8 text-center">
          <div>
            <BarChart3 className="mx-auto size-10 text-slate-600" />
            <p className="mt-4 font-medium text-white">Результатов пока нет</p>
            <p className="mt-1 text-sm text-slate-500">Пройдите любой модуль, чтобы увидеть динамику.</p>
          </div>
        </Card>
      ) : (
        <div className="mt-8 space-y-3">
          {history.data.map((item) => (
            <Link to={`/history/${item.id}`} key={item.id} className="block transition-transform hover:-translate-y-1">
              <Card className="grid gap-5 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center hover:border-cyan-300/30 transition-colors">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <CalendarDays className="size-3.5" /> {formatDate(item.started_at)}
                  </div>
                  <h2 className="mt-2 font-semibold text-white">{item.module_title}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.status === "completed" ? "Завершено" : "Прервано"}
                  </p>
                </div>
                <div className="min-w-28">
                  <span className="text-xs text-slate-500">Результат</span>
                  <strong className="mt-1 block text-xl text-cyan-200">
                    {item.module_code === "sequential-search"
                      ? `${item.items_found} / ${Number((item.result as Record<string, unknown> | null)?.total_numbers ?? 100)}`
                      : item.module_code === "nervous-system" 
                      ? `${(item.result as Record<string, unknown> | null)?.total ?? 0} кл.`
                      : `${Math.round(item.accuracy ?? 0)}%`}
                  </strong>
                </div>
                <div className="min-w-24">
                  <span className="text-xs text-slate-500">Время</span>
                  <strong className="mt-1 flex items-center gap-2 text-sm text-slate-200">
                    <Timer className="size-4 text-slate-500" /> {formatDuration(item.duration_ms)}
                  </strong>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
