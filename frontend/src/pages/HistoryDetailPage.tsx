import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { api } from "../api/client";
import { ErrorNotice } from "../components/ErrorNotice";
import { LoadingState } from "../components/LoadingState";
import { ResultPanel } from "../components/ResultPanel";
import { cn } from "../lib/utils";

export function HistoryDetailPage() {
  const { id } = useParams();
  const { data: attempt, isLoading, error } = useQuery({
    queryKey: ["attempt", id],
    queryFn: () => api.attempt(Number(id)),
  });

  if (isLoading) return <LoadingState label="Загрузка результата..." />;
  if (error || !attempt) return <div className="p-8"><ErrorNotice message="Попытка не найдена" /></div>;

  const res = attempt.result as any || {};

  // Обертка, так как ResultPanel ожидает onRepeat, но в истории он нам не нужен (мы скрываем кнопку повтора)
  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/history" className="back-link mb-6 inline-flex"><ArrowLeft className="size-4" /> Назад в историю</Link>
      
      {/* Рендеринг специфичных данных в зависимости от модуля */}
      {attempt.module_code === "sequential-search" && (
        <ResultPanel attempt={attempt} title="Осмотрительность" scoreLabel="Найдено чисел">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-white/[0.035] p-4 text-center"><span className="text-xs text-slate-500">Ошибки</span><strong className="mt-1 block text-lg text-white">{attempt.metrics.incorrect_actions}</strong></div>
            <div className="rounded-xl bg-white/[0.035] p-4 text-center"><span className="text-xs text-slate-500">Скорость</span><strong className="mt-1 block text-lg text-white">{attempt.metrics.speed_per_minute ?? 0} / мин</strong></div>
            <div className="rounded-xl bg-white/[0.035] p-4 text-center"><span className="text-xs text-slate-500">Средняя реакция</span><strong className="mt-1 block text-lg text-white">{attempt.metrics.average_reaction_ms ? `${(attempt.metrics.average_reaction_ms / 1000).toFixed(2)} с` : "—"}</strong></div>
          </div>
        </ResultPanel>
      )}

      {attempt.module_code === "attention-switching" && (
        <ResultPanel attempt={attempt} title="Переключение внимания" scoreLabel="Оценка (0-100)">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-white/[0.035] p-4 text-center"><span className="text-xs text-slate-500">Стоимость (Сек)</span><strong className="mt-1 block text-lg text-white">{(res.switch_cost_ms / 1000).toFixed(2)}</strong></div>
            <div className="rounded-xl bg-white/[0.035] p-4 text-center"><span className="text-xs text-slate-500">Ошибки</span><strong className="mt-1 block text-lg text-white">{res.errors?.["1"] + res.errors?.["2"] + res.errors?.["3"] || 0}</strong></div>
            <div className="rounded-xl bg-white/[0.035] p-4 text-center"><span className="text-xs text-slate-500">Уровень</span><strong className="mt-1 block text-lg text-cyan-200">{res.grade === "high" ? "Высокий" : res.grade === "medium" ? "Средний" : "Низкий"}</strong></div>
          </div>
        </ResultPanel>
      )}

      {attempt.module_code === "fine-motor-skills" && (
        <ResultPanel attempt={attempt} title="Мелкая моторика" scoreLabel="Коэф. КММ (0-100)">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-white/[0.035] p-4 text-center"><span className="text-xs text-slate-500">Точность удержания</span><strong className="mt-1 block text-xl text-white">{res.accuracy_percent}%</strong></div>
            <div className="rounded-xl bg-white/[0.035] p-4 text-center"><span className="text-xs text-slate-500">Выходов за границы</span><strong className={cn("mt-1 block text-xl", res.error_count > 0 ? "text-rose-300" : "text-emerald-300")}>{res.error_count}</strong></div>
            <div className="rounded-xl bg-white/[0.035] p-4 text-center"><span className="text-xs text-slate-500">Плавность движений</span><strong className="mt-1 block text-xl text-white">{res.smoothness} / 100</strong></div>
            <div className="rounded-xl bg-white/[0.035] p-4 text-center"><span className="text-xs text-slate-500">Средняя скорость</span><strong className="mt-1 block text-xl text-white">{res.velocity} px/с</strong></div>
          </div>
        </ResultPanel>
      )}

      {attempt.module_code === "nervous-system" && (
        <ResultPanel attempt={attempt} title="Теппинг-тест" hideDefaultStats={true} customHeaderStats={
          <>
            <div className="bg-slate-950/80 p-6 text-center"><span className="text-xs tracking-widest text-slate-500 uppercase">Индекс утомления</span><strong className={cn("mt-2 block text-4xl font-semibold", res.fatigue_index > 20 ? "text-rose-300" : "text-emerald-300")}>{res.fatigue_index}%</strong></div>
            <div className="bg-slate-950/80 p-6 text-center"><span className="text-xs tracking-widest text-slate-500 uppercase">Устойчивость</span><strong className="mt-2 block text-4xl font-semibold text-cyan-200">{res.stability}%</strong></div>
          </>
        }>
          <div className="text-center mb-8"><h3 className="text-2xl text-cyan-300 font-semibold">{res.curve_type} тип</h3></div>
          <div className="grid grid-cols-6 gap-2 h-32 items-end border-b border-white/10 pb-2">
            {res.intervals?.map((val: number, i: number) => (
              <div key={i} className="flex flex-col items-center"><span className="text-xs font-mono text-cyan-100 mb-1">{val}</span><div className="w-full max-w-[40px] bg-cyan-500/80 rounded-t" style={{ height: `${(val / Math.max(...res.intervals)) * 100}%` }}></div></div>
            ))}
          </div>
        </ResultPanel>
      )}

      {/* fallback для остальных модулей (2, 3, 4) */}
      {!["sequential-search", "attention-switching", "fine-motor-skills", "nervous-system"].includes(attempt.module_code) && (
         <ResultPanel attempt={attempt} title={attempt.module_title} />
      )}
    </div>
  );
}