import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock3, Crosshair, Play, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, type AttemptState } from "../api/client";
import { ErrorNotice } from "../components/ErrorNotice";
import { LoadingState } from "../components/LoadingState";
import { ResultPanel } from "../components/ResultPanel";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";

const STORAGE_KEY = "fpv.active.sequential-search";

interface NumberCell {
  position: number;
  value: number;
}

interface AttentionTask {
  cells: NumberCell[];
  grid_rows: number;
  grid_columns: number;
  min_number: number;
  max_number: number;
  time_limit_ms: number;
  font_size_pt: number;
  font_style: string;
  show_cell_borders: boolean;
  next_number: number;
  next_action_sequence: number;
  normative_range: { min: number; max: number };
}

function getTask(attempt: AttemptState): AttentionTask {
  return attempt.task as unknown as AttentionTask;
}

function remainingLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function AttentionPage() {
  const queryClient = useQueryClient();
  const modules = useQuery({ queryKey: ["modules"], queryFn: api.modules });
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [savingExit, setSavingExit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localFound, setLocalFound] = useState(0);
  const [localErrors, setLocalErrors] = useState(0);
  const [remaining, setRemaining] = useState(300_000);
  const [wrongPosition, setWrongPosition] = useState<number | null>(null);
  const sequenceRef = useRef(1);
  const localFoundRef = useRef(0);
  const localErrorsRef = useRef(0);
  const lastActionAtRef = useRef(performance.now());
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const finishSentRef = useRef(false);
  const module = modules.data?.find((item) => item.code === "sequential-search");
  const configured = (module?.config ?? {}) as Record<string, unknown>;
  const configuredMin = Number(configured.min_number ?? 1);
  const configuredMax = Number(configured.max_number ?? 25);
  const configuredRows = Number(configured.grid_rows ?? 5);
  const configuredColumns = Number(configured.grid_columns ?? 5);
  const configuredTime = Number(configured.time_limit_ms ?? 300_000);

  const syncAttempt = useCallback((state: AttemptState) => {
    setAttempt(state);
    setLocalFound(state.metrics.items_found);
    setLocalErrors(state.metrics.incorrect_actions);
    localFoundRef.current = state.metrics.items_found;
    localErrorsRef.current = state.metrics.incorrect_actions;
    const task = getTask(state);
    sequenceRef.current = task.next_action_sequence ?? 1;
    finishSentRef.current = state.status !== "in_progress";
    if (state.status === "in_progress") {
      localStorage.setItem(STORAGE_KEY, String(state.id));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    if (!stored) {
      setLoading(false);
      return;
    }
    let active = true;
    api
      .attempt(stored)
      .then((state) => {
        if (!active) return;
        if (state.status === "in_progress") syncAttempt(state);
        else localStorage.removeItem(STORAGE_KEY);
      })
      .catch(() => localStorage.removeItem(STORAGE_KEY))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [syncAttempt]);

  const completeWithState = useCallback(
    (state: AttemptState) => {
      syncAttempt(state);
      if (state.status !== "in_progress") {
        void queryClient.invalidateQueries({ queryKey: ["modules"] });
        void queryClient.invalidateQueries({ queryKey: ["history"] });
      }
    },
    [queryClient, syncAttempt],
  );

  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress" || !attempt.deadline_at) return;
    const deadline = new Date(attempt.deadline_at).getTime();
    const tick = () => {
      const value = Math.max(0, deadline - Date.now());
      setRemaining(value);
      if (value === 0 && !finishSentRef.current) {
        finishSentRef.current = true;
        queueRef.current = queueRef.current
          .catch(() => undefined)
          .then(() => api.finish(attempt.id))
          .then(completeWithState)
          .catch(() => {
            finishSentRef.current = false;
            setError("Не удалось зафиксировать завершение теста. Повторяем запрос…");
          });
      }
    };
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [attempt, completeWithState]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const state = await api.start("sequential-search");
      lastActionAtRef.current = performance.now();
      syncAttempt(state);
    } catch {
      setError("Не удалось начать тест. Убедитесь, что сервер доступен.");
    } finally {
      setStarting(false);
    }
  }

  function handleCell(cell: NumberCell) {
    if (!attempt || attempt.status !== "in_progress" || remaining <= 0) return;
    if (cell.value <= localFoundRef.current) return;

    const now = performance.now();
    const task = getTask(attempt);
    const isCorrect = cell.value === task.min_number + localFoundRef.current;
    const sequence = sequenceRef.current++;
    const startedAt = new Date(attempt.started_at).getTime();
    const action = {
      sequence_number: sequence,
      selected_number: cell.value,
      grid_position: cell.position,
      elapsed_ms: Math.max(0, Math.round(Date.now() - startedAt)),
      reaction_time_ms: Math.max(0, Math.round(now - lastActionAtRef.current)),
    };
    lastActionAtRef.current = now;

    if (isCorrect) {
      localFoundRef.current += 1;
      setLocalFound(localFoundRef.current);
    } else {
      localErrorsRef.current += 1;
      setLocalErrors(localErrorsRef.current);
      setWrongPosition(cell.position);
      window.setTimeout(() => setWrongPosition(null), 350);
    }

    queueRef.current = queueRef.current
      .catch(() => undefined)
      .then(() => api.attentionAction(attempt.id, action))
      .then((state) => {
        if (state.status !== "in_progress") {
          completeWithState(state);
        }
      })
      .catch(async () => {
        setError("Действие не сохранилось. Состояние теста синхронизировано с сервером.");
        try {
          completeWithState(await api.attempt(attempt.id));
        } catch {
          // The visible error already gives the user an actionable state.
        }
      });
  }

  function repeat() {
    setAttempt(null);
    setError(null);
    setRemaining(300_000);
    void start();
  }

  async function saveAndExit() {
    if (!attempt || savingExit) return;
    setSavingExit(true);
    setError(null);
    try {
      await queueRef.current.catch(() => undefined);
      syncAttempt(await api.finish(attempt.id));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["modules"], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: ["history"], refetchType: "all" }),
      ]);
      navigate("/");
    } catch {
      setError("Не удалось сохранить актуальный прогресс. Попробуйте ещё раз.");
      setSavingExit(false);
    }
  }

  if (loading) return <LoadingState label="Восстановление попытки" />;

  if (!attempt) {
    return (
      <section className="mx-auto max-w-4xl">
        <Link to="/" className="back-link">
          <ArrowLeft className="size-4" /> К модулям
        </Link>
        <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_300px]">
          <div>
            <p className="eyebrow">Модуль 01</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Оценка осмотрительности</h1>
            <p className="mt-5 text-base leading-7 text-slate-400">
              Последовательно найдите числа от {configuredMin} до {configuredMax}. Тест измеряет скорость
              визуального поиска, точность и устойчивость внимания.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <InfoTile
                icon={Clock3}
                value={remainingLabel(configuredTime)}
                label="Лимит времени"
              />
              <InfoTile
                icon={Crosshair}
                value={`${configuredMin} → ${configuredMax}`}
                label="Последовательность"
              />
              <InfoTile
                icon={ShieldCheck}
                value={`${configuredRows} × ${configuredColumns}`}
                label="Матрица"
              />
            </div>
          </div>
          <Card className="p-6">
            <h2 className="font-semibold text-white">Перед началом</h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
              <li>1. Расположитесь удобно перед экраном.</li>
              <li>2. Начинайте с числа 1 и двигайтесь строго по порядку.</li>
              <li>3. Ошибочные нажатия учитываются в результате.</li>
            </ol>
            <Button onClick={start} disabled={starting} size="lg" className="mt-6 w-full">
              <Play className="size-4 fill-current" /> {starting ? "Подготовка…" : "Начать тест"}
            </Button>
          </Card>
        </div>
        {error && <div className="mt-5"><ErrorNotice message={error} /></div>}
      </section>
    );
  }

  if (attempt.status !== "in_progress") {
    const result = (attempt.result ?? {}) as {
      attention_grade?: { label: string; interpretation: string };
      per_minute_pace?: number[];
      normative_range?: { min: number; max: number };
    };
    return (
      <ResultPanel
        attempt={attempt}
        title={result.attention_grade?.label ? `${result.attention_grade.label} уровень` : "Результат"}
        scoreLabel="Найдено чисел"
        onRepeat={repeat}
      >
        <p className="text-center text-sm leading-6 text-slate-400">
          {result.attention_grade?.interpretation}
        </p>
        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          <ResultMetric label="Ошибки" value={attempt.metrics.incorrect_actions} />
          <ResultMetric
            label="Скорость"
            value={`${attempt.metrics.speed_per_minute ?? 0} / мин`}
          />
          <ResultMetric
            label="Средняя реакция"
            value={
              attempt.metrics.average_reaction_ms
                ? `${(attempt.metrics.average_reaction_ms / 1000).toFixed(2)} с`
                : "—"
            }
          />
        </div>
        {result.per_minute_pace && (
          <div className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Динамика работы</h3>
              <span className="text-xs text-slate-500">найдено за минуту</span>
            </div>
            <div className="grid h-36 grid-cols-5 items-end gap-3">
              {result.per_minute_pace.map((value, index) => (
                <div key={index} className="flex h-full flex-col justify-end text-center">
                  <span className="mb-2 text-xs font-semibold text-cyan-200">{value}</span>
                  <span
                    className="mx-auto w-full max-w-14 rounded-t-md bg-cyan-300/60"
                    style={{ height: `${Math.max(4, value * 2)}%` }}
                  />
                  <span className="mt-2 text-[10px] text-slate-600">{index + 1} мин</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </ResultPanel>
    );
  }

  const task = getTask(attempt);
  const totalNumbers = task.max_number - task.min_number + 1;
  const nextNumber = Math.min(task.min_number + localFound, task.max_number);
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <button type="button" className="back-link" onClick={saveAndExit} disabled={savingExit}>
            <ArrowLeft className="size-4" /> {savingExit ? "Сохранение…" : "Сохранить и выйти"}
          </button>
          <h1 className="mt-3 text-xl font-semibold text-white">Оценка осмотрительности</h1>
        </div>
        <div className="flex gap-2 sm:gap-3" aria-live="polite">
          <MetricChip label="Следующее" value={String(nextNumber).padStart(2, "0")} accent />
          <MetricChip label="Время" value={remainingLabel(remaining)} warning={remaining < 30_000} />
          <MetricChip label="Ошибки" value={String(localErrors)} />
        </div>
      </div>
      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}
      <Card className="overflow-hidden p-3 sm:p-5 lg:p-6">
        <div className="mb-4 flex items-center justify-between gap-3 px-1 text-xs text-slate-500">
          <span>Нажимайте числа строго по возрастанию</span>
          <span className="font-mono text-cyan-300">{localFound} / {totalNumbers}</span>
        </div>
        <div
          className="number-grid"
          style={{ gridTemplateColumns: `repeat(${task.grid_columns}, minmax(0, 1fr))` }}
          role="grid"
          aria-label={`Таблица чисел от ${task.min_number} до ${task.max_number}`}
        >
          {task.cells.map((cell) => {
            const done = cell.value < task.min_number + localFound;
            return (
              <button
                key={cell.position}
                type="button"
                className={cn(
                  "number-cell",
                  done && "number-cell-done",
                  wrongPosition === cell.position && "number-cell-wrong",
                )}
                disabled={done || remaining <= 0}
                onClick={() => handleCell(cell)}
                style={{
                  fontSize: `${task.font_size_pt}pt`,
                  borderWidth: task.show_cell_borders ? undefined : 0,
                  fontStyle: task.font_style === "italic" ? "italic" : undefined,
                }}
                aria-label={`Число ${cell.value}${done ? ", найдено" : ""}`}
                role="gridcell"
              >
                {cell.value}
              </button>
            );
          })}
        </div>
      </Card>
    </section>
  );
}

function InfoTile({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Clock3;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
      <Icon className="size-4 text-cyan-300" />
      <strong className="mt-3 block text-sm text-white">{value}</strong>
      <span className="mt-1 block text-xs text-slate-500">{label}</span>
    </div>
  );
}

function MetricChip({
  label,
  value,
  accent = false,
  warning = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="min-w-20 rounded-xl border border-white/8 bg-slate-900/80 px-3 py-2 text-center sm:min-w-24">
      <span className="block text-[9px] tracking-widest text-slate-500 uppercase">{label}</span>
      <strong
        className={cn(
          "mt-0.5 block font-mono text-lg text-white",
          accent && "text-cyan-200",
          warning && "text-amber-300",
        )}
      >
        {value}
      </strong>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white/[0.035] p-4 text-center">
      <span className="text-xs text-slate-500">{label}</span>
      <strong className="mt-1 block text-lg text-white">{value}</strong>
    </div>
  );
}
