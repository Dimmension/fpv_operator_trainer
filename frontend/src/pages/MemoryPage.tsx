import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Brain, Eye, Grid3X3, Play, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, type AttemptState, type ShapePlacement } from "../api/client";
import { ErrorNotice } from "../components/ErrorNotice";
import { LoadingState } from "../components/LoadingState";
import { ResultPanel } from "../components/ResultPanel";
import { Shape } from "../components/Shape";
import { SHAPE_LABELS, type ShapeName } from "../components/shapeTypes";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";

const STORAGE_KEY = "fpv.active.visual-memory";
const SHAPES = Object.keys(SHAPE_LABELS) as ShapeName[];
const FIRST_SHAPE: ShapeName = "circle";

type Phase = "intro" | "ready" | "countdown" | "attention" | "exposure" | "recall" | "submitting" | "result";

interface Stimulus {
  placements: Array<{ grid_position: number; shape: ShapeName }>;
}

interface MemoryTask {
  grid_rows: number;
  grid_columns: number;
  shape_count: number;
  round_count: number;
  shapes: string[];
}

interface MemoryResult {
  exact_matches?: number;
  position_matches?: number;
  total_possible?: number;
  rounds?: Array<{
    round_number: number;
    exact_matches: number;
    position_matches: number;
    response_time_ms: number;
  }>;
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

function getTask(attempt: AttemptState): MemoryTask {
  return attempt.task as unknown as MemoryTask;
}

function exposureLabel(milliseconds: number): string {
  const seconds = milliseconds / 1000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} сек.`;
}

export function MemoryPage() {
  const queryClient = useQueryClient();
  const modules = useQuery({ queryKey: ["modules"], queryFn: api.modules });
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [savingExit, setSavingExit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [activeShape, setActiveShape] = useState<ShapeName>(FIRST_SHAPE);
  const [placements, setPlacements] = useState<Record<number, ShapeName>>({});
  const presentationTokenRef = useRef(0);
  const recallStartedAtRef = useRef(0);
  const module = modules.data?.find((item) => item.code === "visual-memory");
  const configured = (module?.config ?? {}) as Record<string, unknown>;
  const configuredRows = Number(configured.grid_rows ?? 5);
  const configuredColumns = Number(configured.grid_columns ?? 5);
  const configuredShapeCount = Number(configured.shape_count ?? 5);
  const configuredRoundCount = Number(configured.round_count ?? 1);
  const configuredExposure = Number(configured.exposure_ms ?? 3_000);
  const task = attempt ? getTask(attempt) : null;
  const availableShapes = (task?.shapes ?? SHAPES)
    .filter((shape): shape is ShapeName => shape in SHAPE_LABELS)
    .slice(0, task?.shape_count ?? SHAPES.length);
  const shapeCount = task?.shape_count ?? configuredShapeCount;
  const totalRounds = task?.round_count ?? configuredRoundCount;
  const gridRows = task?.grid_rows ?? configuredRows;
  const gridColumns = task?.grid_columns ?? configuredColumns;
  const gridCells = gridRows * gridColumns;

  const syncAttempt = useCallback((state: AttemptState) => {
    setAttempt(state);
    setPlacements({});
    const stateTask = getTask(state);
    const firstShape = stateTask.shapes.find((shape): shape is ShapeName => shape in SHAPE_LABELS);
    setActiveShape(firstShape ?? FIRST_SHAPE);
    if (state.status === "in_progress") {
      localStorage.setItem(STORAGE_KEY, String(state.id));
      setPhase("ready");
    } else {
      localStorage.removeItem(STORAGE_KEY);
      setPhase("result");
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
      presentationTokenRef.current += 1;
    };
  }, [syncAttempt]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      syncAttempt(await api.start("visual-memory"));
    } catch {
      setError("Не удалось начать тест. Убедитесь, что сервер доступен.");
    } finally {
      setStarting(false);
    }
  }

  async function presentRound() {
    if (!attempt?.current_round) return;
    const token = ++presentationTokenRef.current;
    setError(null);
    setPlacements({});
    setCountdown(3);
    setPhase("countdown");
    for (const value of [3, 2, 1]) {
      setCountdown(value);
      await delay(650);
      if (presentationTokenRef.current !== token) return;
    }
    setPhase("attention");
    await delay(500);
    if (presentationTokenRef.current !== token) return;
    setPhase("exposure");
    await delay(attempt.current_round.exposure_ms);
    if (presentationTokenRef.current !== token) return;
    recallStartedAtRef.current = performance.now();
    setPhase("recall");
  }

  function placeShape(position: number) {
    setPlacements((current) => {
      const next = { ...current };
      const previousPosition = Object.entries(next).find(([, shape]) => shape === activeShape)?.[0];
      if (previousPosition !== undefined) delete next[Number(previousPosition)];
      if (next[position] === activeShape) {
        delete next[position];
        return next;
      }
      delete next[position];
      next[position] = activeShape;
      return next;
    });
    const unusedShape = availableShapes.find(
      (shape) => shape !== activeShape && !Object.values(placements).includes(shape),
    );
    if (unusedShape) setActiveShape(unusedShape);
  }

  async function submitAnswer() {
    if (!attempt?.current_round || Object.keys(placements).length !== shapeCount) return;
    setPhase("submitting");
    setError(null);
    const answer = Object.entries(placements).map(([position, shape]) => ({
      grid_position: Number(position),
      shape,
    })) as ShapePlacement[];
    try {
      const state = await api.memoryAnswer(
        attempt.id,
        attempt.current_round.round_number,
        answer,
        Math.round(performance.now() - recallStartedAtRef.current),
      );
      syncAttempt(state);
      if (state.status !== "in_progress") {
        void queryClient.invalidateQueries({ queryKey: ["modules"] });
        void queryClient.invalidateQueries({ queryKey: ["history"] });
      }
    } catch {
      setError("Не удалось сохранить ответ. Проверьте соединение и попробуйте ещё раз.");
      setPhase("recall");
    }
  }

  function repeat() {
    setAttempt(null);
    setPhase("intro");
    setError(null);
    void start();
  }

  async function saveAndExit() {
    if (!attempt || savingExit || phase === "submitting") return;
    presentationTokenRef.current += 1;
    setSavingExit(true);
    setError(null);
    try {
      syncAttempt(await api.finish(attempt.id));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["modules"], refetchType: "all" }),
        queryClient.invalidateQueries({ queryKey: ["history"], refetchType: "all" }),
      ]);
      navigate("/");
    } catch {
      setError("Не удалось сохранить актуальный прогресс. Попробуйте ещё раз.");
      setSavingExit(false);
      setPhase("ready");
    }
  }

  if (loading) return <LoadingState label="Восстановление попытки" />;

  if (!attempt || phase === "intro") {
    return (
      <section className="mx-auto max-w-4xl">
        <Link to="/" className="back-link">
          <ArrowLeft className="size-4" /> К модулям
        </Link>
        <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_300px]">
          <div>
            <p className="eyebrow">Модуль 02</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Определение объёма внимания</h1>
            <p className="mt-5 text-base leading-7 text-slate-400">
              Запомните {configuredShapeCount} фигур за короткую экспозицию и восстановите каждую фигуру
              в правильной клетке матрицы.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <InfoTile
                icon={Grid3X3}
                value={`${configuredRows} × ${configuredColumns}`}
                label="Матрица"
              />
              <InfoTile
                icon={Eye}
                value={exposureLabel(configuredExposure)}
                label="Экспозиция"
              />
              <InfoTile
                icon={ScanLine}
                value={`${configuredRoundCount} раунд`}
                label="Серия теста"
              />
            </div>
          </div>
          <Card className="p-6">
            <h2 className="font-semibold text-white">Как выполнять</h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
              <li>1. Смотрите на всю матрицу целиком.</li>
              <li>2. Запомните типы фигур и их клетки.</li>
              <li>3. Результаты раундов появятся только в конце.</li>
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

  if (phase === "result" || attempt.status !== "in_progress") {
    const result = (attempt.result ?? {}) as MemoryResult;
    const totalPossible = result.total_possible ?? shapeCount * totalRounds;
    return (
      <ResultPanel attempt={attempt} title="Серия завершена" scoreLabel="Точность, %" onRepeat={repeat}>
        <div className="grid gap-4 sm:grid-cols-3">
          <ResultMetric label="Точных совпадений" value={`${result.exact_matches ?? 0} / ${totalPossible}`} />
          <ResultMetric label="Правильных позиций" value={`${result.position_matches ?? 0} / ${totalPossible}`} />
          <ResultMetric
            label="Среднее время ответа"
            value={
              attempt.metrics.average_reaction_ms
                ? `${(attempt.metrics.average_reaction_ms / 1000).toFixed(1)} с`
                : "—"
            }
          />
        </div>
        {result.rounds && (
          <div className="mt-8 overflow-hidden rounded-xl border border-white/8">
            <div className="grid grid-cols-3 bg-white/[0.035] px-4 py-3 text-[10px] tracking-widest text-slate-500 uppercase">
              <span>Раунд</span><span className="text-center">Точно</span><span className="text-right">Позиции</span>
            </div>
            {result.rounds.map((round) => (
              <div key={round.round_number} className="grid grid-cols-3 border-t border-white/6 px-4 py-3 text-sm">
                <span className="text-slate-400">{String(round.round_number).padStart(2, "0")}</span>
                <strong className="text-center text-cyan-200">{round.exact_matches} / {shapeCount}</strong>
                <span className="text-right text-slate-300">{round.position_matches} / {shapeCount}</span>
              </div>
            ))}
          </div>
        )}
      </ResultPanel>
    );
  }

  const round = attempt.current_round;
  const stimulus = round?.stimulus as unknown as Stimulus | undefined;
  const isRecall = phase === "recall" || phase === "submitting";

  return (
    <section className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            type="button"
            className="back-link"
            onClick={saveAndExit}
            disabled={savingExit || phase === "submitting"}
          >
            <ArrowLeft className="size-4" /> {savingExit ? "Сохранение…" : "Сохранить и выйти"}
          </button>
          <h1 className="mt-3 text-xl font-semibold text-white">Определение объёма внимания</h1>
        </div>
        <div className="rounded-xl border border-white/8 bg-slate-900/80 px-5 py-3 text-center">
          <span className="block text-[9px] tracking-widest text-slate-500 uppercase">Раунд</span>
          <strong className="mt-0.5 block font-mono text-lg text-cyan-200">
            {round?.round_number ?? totalRounds} / {totalRounds}
          </strong>
        </div>
      </div>

      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}

      <Card className="min-h-150 p-5 sm:p-8">
        {phase === "ready" && (
          <div className="grid min-h-125 place-items-center text-center">
            <div className="max-w-md">
              <span className="mx-auto grid size-20 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/8 text-cyan-200">
                <Brain className="size-9" />
              </span>
              <p className="eyebrow mt-6">Раунд {round?.round_number} из {totalRounds}</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Приготовьтесь</h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                После отсчёта комбинация появится на {exposureLabel(round?.exposure_ms ?? configuredExposure)}
              </p>
              <Button onClick={presentRound} size="lg" className="mt-7">
                Я готов <Eye className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {phase === "countdown" && (
          <div className="grid min-h-125 place-items-center" aria-live="assertive">
            <span className="countdown-number" key={countdown}>{countdown}</span>
          </div>
        )}

        {phase === "attention" && (
          <div className="grid min-h-125 place-items-center" aria-live="assertive">
            <div className="text-center">
              <ScanLine className="mx-auto size-12 animate-pulse text-cyan-300" />
              <strong className="mt-5 block text-3xl tracking-[0.2em] text-white uppercase">Внимание!</strong>
            </div>
          </div>
        )}

        {(phase === "exposure" || isRecall) && stimulus && (
          <div>
            <div
              className={cn("mb-6 min-h-10 text-center", !isRecall && "invisible")}
              aria-hidden={!isRecall}
            >
              <p className="text-sm text-slate-400">Выберите фигуру, затем укажите её клетку.</p>
              <p className="mt-1 text-xs text-slate-600">Фигуру можно переместить до отправки ответа.</p>
            </div>
            <div className="grid gap-7 lg:grid-cols-[1fr_150px] lg:items-center">
              <div className="mx-auto w-full max-w-125">
                {isRecall ? (
                  <div
                    className="memory-grid"
                    style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
                    role="grid"
                    aria-label="Матрица ответа"
                  >
                    {Array.from({ length: gridCells }, (_, position) => (
                      <button
                        key={position}
                        type="button"
                        className={cn("memory-cell", placements[position] && "memory-cell-filled")}
                        onClick={() => placeShape(position)}
                        disabled={phase === "submitting"}
                        aria-label={`Клетка ${position + 1}${placements[position] ? `, ${SHAPE_LABELS[placements[position]]}` : ""}`}
                        role="gridcell"
                      >
                        {placements[position] && <Shape shape={placements[position]} className="size-8 sm:size-11" />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <MemoryGrid stimulus={stimulus} rows={gridRows} columns={gridColumns} />
                )}
              </div>
              <div
                className={cn("flex justify-center gap-2 lg:flex-col", !isRecall && "invisible")}
                aria-label="Выбор фигуры"
                aria-hidden={!isRecall}
              >
                {availableShapes.map((shape) => {
                  const used = Object.values(placements).includes(shape);
                  return (
                    <button
                      key={shape}
                      type="button"
                      onClick={() => setActiveShape(shape)}
                      className={cn(
                        "shape-choice",
                        activeShape === shape && "shape-choice-active",
                        used && "shape-choice-used",
                      )}
                      aria-pressed={activeShape === shape}
                      title={SHAPE_LABELS[shape]}
                    >
                      <Shape shape={shape} className="size-7" />
                      <span className="sr-only">{SHAPE_LABELS[shape]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div
              className={cn("mt-7 flex min-h-11 items-center justify-center gap-5", !isRecall && "invisible")}
              aria-hidden={!isRecall}
            >
              <span className="text-sm text-slate-500">Размещено: {Object.keys(placements).length} / {shapeCount}</span>
              <Button
                onClick={submitAnswer}
                disabled={Object.keys(placements).length !== shapeCount || phase === "submitting"}
                size="lg"
              >
                {phase === "submitting" ? "Сохранение…" : round?.round_number === totalRounds ? "Завершить тест" : "Готово"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

function MemoryGrid({
  stimulus,
  rows,
  columns,
}: {
  stimulus: Stimulus;
  rows: number;
  columns: number;
}) {
  const cells = Object.fromEntries(
    stimulus.placements.map((item) => [item.grid_position, item.shape]),
  ) as Record<number, ShapeName>;
  return (
    <div
      className="memory-grid w-full max-w-125"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-label="Комбинация фигур"
    >
      {Array.from({ length: rows * columns }, (_, position) => (
        <div key={position} className="memory-cell">
          {cells[position] && <Shape shape={cells[position]} className="size-8 sm:size-11" />}
        </div>
      ))}
    </div>
  );
}

function InfoTile({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Eye;
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

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.035] p-4 text-center">
      <span className="text-xs text-slate-500">{label}</span>
      <strong className="mt-1 block text-lg text-white">{value}</strong>
    </div>
  );
}
