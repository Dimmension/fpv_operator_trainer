import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play, Shuffle } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api, type AttemptState } from "../api/client";
import { ErrorNotice } from "../components/ErrorNotice";
import { LoadingState } from "../components/LoadingState";
import { ResultPanel } from "../components/ResultPanel";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";

type SwitchingCell = { position: number; type: "arabic" | "roman"; value: number; display: string };
type SwitchingTask = { cells: SwitchingCell[]; current_phase: number; next_action_sequence: number; times: any };

export function SwitchingPage() {
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<number, "correct" | "wrong">>({});
  
  const startMs = useRef(performance.now());
  const lastActionMs = useRef(performance.now());

  const accept = useCallback((state: AttemptState) => {
    setAttempt(state);
    queryClient.invalidateQueries({ queryKey: ["modules"] });
  }, [queryClient]);

  async function start() {
    setPending(true); setError(null); setFeedback({});
    try { 
      const state = await api.start("attention-switching");
      startMs.current = performance.now();
      lastActionMs.current = performance.now();
      accept(state);
    } catch { setError("Не удалось начать тест."); }
    finally { setPending(false); }
  }

  async function clickCell(position: number) {
    if (!attempt || attempt.status !== "in_progress" || pending) return;
    const task = attempt.task as SwitchingTask;
    
    // Локальная проверка для красивой подсветки (свечение поверх базового цвета)
    const phase = task.current_phase;
    const itemsFound = attempt.metrics.items_found;
    const cell = task.cells.find(c => c.position === position);
    
    if (cell) {
      let expectedType = "";
      let expectedVal = 0;
      if (phase === 1) { expectedType = "arabic"; expectedVal = itemsFound + 1; }
      else if (phase === 2) { expectedType = "roman"; expectedVal = 24 - itemsFound; }
      else if (phase === 3) {
        if (itemsFound % 2 === 0) { expectedType = "arabic"; expectedVal = Math.floor(itemsFound/2) + 1; }
        else { expectedType = "roman"; expectedVal = 24 - Math.floor(itemsFound/2); }
      }
      const isCorrect = cell.type === expectedType && cell.value === expectedVal;
      
      setFeedback(prev => ({ ...prev, [position]: isCorrect ? "correct" : "wrong" }));
      setTimeout(() => {
        setFeedback(prev => {
          const next = { ...prev };
          delete next[position];
          return next;
        });
      }, 1500); // Подсветка плавно затухает через 1.5 сек
    }

    setPending(true); setError(null);
    const now = performance.now();
    const elapsed = Math.round(now - startMs.current);
    const reaction = Math.round(now - lastActionMs.current);
    lastActionMs.current = now;

    try {
      const state = await api.switchingAction(attempt.id, {
        sequence_number: task.next_action_sequence || 1,
        position, elapsed_ms: elapsed, reaction_time_ms: reaction
      });
      accept(state);
    } catch (e) {
      setError("Ошибка сохранения действия.");
    } finally { setPending(false); }
  }

  if (loading) return <LoadingState />;
  if (!attempt) return (
    <section className="mx-auto max-w-4xl">
      <Link to="/" className="back-link"><ArrowLeft className="size-4" /> К модулям</Link>
      <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_300px]">
        <div>
          <p className="eyebrow">Модуль 05</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Переключение внимания</h1>
          <p className="mt-4 text-slate-400">Тест с черно-красными таблицами Горбова-Шульте. Измеряет "стоимость переключения" когнитивных процессов.</p>
        </div>
        <Card className="p-6">
          <Button size="lg" className="w-full" onClick={start} disabled={pending}><Play className="size-4"/> Начать тест</Button>
        </Card>
      </div>
    </section>
  );

  if (attempt.status !== "in_progress") {
    const res = attempt.result as any;
    const grades: any = { high: "Высокий", medium: "Средний", low: "Низкий" };
    return (
      <ResultPanel attempt={attempt} title="Тест завершен" scoreLabel="Оценка (0-100)" onRepeat={() => setAttempt(null)}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white/[0.035] p-4 text-center">
            <span className="text-xs text-slate-500">Уровень переключения</span>
            <strong className="mt-1 block text-lg text-white">{grades[res.grade]}</strong>
          </div>
          <div className="rounded-xl bg-white/[0.035] p-4 text-center">
            <span className="text-xs text-slate-500">Стоимость (Сек)</span>
            <strong className="mt-1 block text-lg text-white">{(res.switch_cost_ms / 1000).toFixed(2)}</strong>
          </div>
          <div className="rounded-xl bg-white/[0.035] p-4 text-center">
            <span className="text-xs text-slate-500">Ошибки</span>
            <strong className="mt-1 block text-lg text-white">{res.errors}</strong>
          </div>
        </div>
      </ResultPanel>
    );
  }

  const task = attempt.task as SwitchingTask;
  const phase = task.current_phase;
  const instruction = phase === 1 ? "Ищите ТОЛЬКО черные АРАБСКИЕ цифры (1-25) по ВОЗРАСТАНИЮ."
                    : phase === 2 ? "Ищите ТОЛЬКО красные РИМСКИЕ цифры (XXIV-I) по УБЫВАНИЮ."
                    : "ПОПЕРЕМЕННО: Черная (возрастает), Красная (убывает). (1 -> XXIV -> 2 -> XXIII...)";

  return (
    <section>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Shuffle className="size-5"/> Этап {phase} из 3</h1>
        <p className="text-cyan-300 mt-2 font-medium">{instruction}</p>
        <p className="text-xs text-slate-500 mt-1">Ошибки учитываются. Найдено на этом этапе: {attempt.metrics.items_found}</p>
      </div>
      {error && <div className="mb-4"><ErrorNotice message={error}/></div>}
      <Card className="p-3">
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(7, minmax(0, 1fr))` }}>
          {task.cells.map((c) => {
            const f = feedback[c.position];
            const baseStyle = c.type === "arabic" 
              ? "bg-slate-800 text-white border-b-2 border-slate-600 hover:bg-slate-700" 
              : "bg-rose-950 text-rose-200 border-b-2 border-rose-800 hover:bg-rose-900";
            
            let glowStyle = "";
            if (f === "correct") {
              glowStyle = "shadow-[inset_0_0_24px_rgba(16,185,129,0.7)] ring-2 ring-emerald-400 z-10 scale-[1.03]";
            } else if (f === "wrong") {
              glowStyle = "shadow-[inset_0_0_24px_rgba(245,158,11,0.7)] ring-2 ring-amber-500 z-10";
            }

            return (
              <button key={c.position} disabled={pending || f === "correct"} onClick={() => clickCell(c.position)}
                className={cn(
                  "aspect-square rounded flex items-center justify-center font-bold transition-all duration-300 active:scale-95 text-[clamp(12px,2vw,20px)]",
                  baseStyle,
                  glowStyle
                )}>
                {c.display}
              </button>
            );
          })}
        </div>
      </Card>
    </section>
  );
}