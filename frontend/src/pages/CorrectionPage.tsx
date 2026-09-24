import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock3, Play, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { api, type AttemptState } from "../api/client";
import { ErrorNotice } from "../components/ErrorNotice";
import { LoadingState } from "../components/LoadingState";
import { ResultPanel } from "../components/ResultPanel";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";

type ModuleCode = "attention-endurance" | "divided-attention";
type CorrectionTask = {
  cells: string[];
  grid_rows: number;
  grid_columns: number;
  target_symbol: string;
  time_limit_ms: number;
  line_interval_ms: number;
  cursor: number;
  selected_positions: number[];
  wrong_positions: number[];
  line_marks: { elapsed_ms: number; position: number }[];
  next_action_sequence: number;
  stage: "scan" | "recall";
  visible_statement?: string;
  visible_statement_number?: number;
};
type CorrectionResult = {
  processed: number;
  targets: number;
  found: number;
  missed: number;
  false_marks: number;
  table_score: number;
  speed_per_minute: number;
  interval_pace: number[];
  fluctuation_percent: number;
  grade: string;
  memory_score?: number;
  balance?: number;
  recalled?: number;
  statement_count?: number;
  matches?: { answer: string; statement: string }[];
  missed_statements?: string[];
};

function timeLabel(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CorrectionPage({ moduleCode }: { moduleCode: ModuleCode }) {
  const divided = moduleCode === "divided-attention";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const modules = useQuery({ queryKey: ["modules"], queryFn: api.modules });
  const module = modules.data?.find((item) => item.code === moduleCode);
  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [markMode, setMarkMode] = useState(true);
  const [recallText, setRecallText] = useState("");
  const busy = useRef(false);
  const activeAttemptId = attempt?.status === "in_progress" ? attempt.id : null;

  const accept = useCallback((state: AttemptState) => {
    setAttempt(state);
    queryClient.invalidateQueries({ queryKey: ["modules"] });
  }, [queryClient]);

  useEffect(() => {
    if (!module?.active_attempt_id || attempt) return;
    let active = true;
    setLoading(true);
    api.attempt(module.active_attempt_id)
      .then((state) => { if (active) setAttempt(state); })
      .catch(() => { if (active) setError("Не удалось восстановить попытку."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [module?.active_attempt_id, attempt]);

  useEffect(() => {
    if (activeAttemptId === null) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (busy.current) return;
      api.attempt(activeAttemptId).then((state) => {
        if (busy.current) return;
        setAttempt((current) => {
          if (!current || current.status !== "in_progress") return current;
          const currentSequence = (current.task as CorrectionTask).next_action_sequence;
          const incomingSequence = (state.task as CorrectionTask).next_action_sequence;
          return incomingSequence >= currentSequence ? state : current;
        });
      }).catch(() => setError("Не удалось обновить время теста."));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeAttemptId]);

  async function start() {
    setPending(true);
    setError(null);
    try { accept(await api.start(moduleCode)); }
    catch { setError("Не удалось начать тест."); }
    finally { setPending(false); }
  }

  async function act(position: number) {
    if (!attempt || pending || busy.current) return;
    const task = attempt.task as CorrectionTask;
    if (task.stage !== "scan" || position <= task.cursor) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      accept(await api.correctionAction(attempt.id, task.next_action_sequence, position, markMode));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить действие.");
    } finally { busy.current = false; setPending(false); }
  }

  async function submitRecall() {
    if (!attempt || pending) return;
    setPending(true);
    setError(null);
    try {
      accept(await api.recall(attempt.id, recallText.split(/\n|;/).map((item) => item.trim()).filter(Boolean)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось сохранить ответы.");
    } finally { setPending(false); }
  }

  async function exit() {
    if (!attempt || pending) return;
    setPending(true);
    try {
      await api.finish(attempt.id);
      await queryClient.invalidateQueries({ queryKey: ["modules"] });
      navigate("/");
    } catch { setError("Не удалось завершить попытку."); setPending(false); }
  }

  if (modules.isLoading || loading) return <LoadingState />;
  const config = (module?.config ?? {}) as Record<string, unknown>;
  const title = module?.title ?? (divided ? "Распределение внимания" : "Стойкость внимания");
  const task = attempt?.task as CorrectionTask | undefined;
  const remaining = attempt?.deadline_at ? Math.max(0, Date.parse(attempt.deadline_at) - now) : Number(config.time_limit_ms ?? 300000);
  const elapsed = Number(task?.time_limit_ms ?? config.time_limit_ms ?? 300000) - remaining;
  const lineNumber = Math.floor(elapsed / Number(task?.line_interval_ms ?? 30000));

  if (!attempt) return (
    <section className="mx-auto max-w-4xl">
      <Link to="/" className="back-link"><ArrowLeft className="size-4" /> К модулям</Link>
      <div className="mt-8 grid gap-5 md:grid-cols-[1.3fr_1fr]">
        <Card className="p-7 sm:p-9">
          <p className="eyebrow">Модуль {divided ? "04" : "03"}</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">{title}</h1>
          <p className="mt-4 text-sm leading-7 text-slate-400">{module?.instructions}</p>
          <div className="mt-7 flex gap-5 text-sm text-cyan-200">
            <span>{Number(config.grid_rows ?? (divided ? 20 : 15))} × {Number(config.grid_columns ?? (divided ? 30 : 20))} знаков</span>
            <span>{Number(config.time_limit_ms ?? (divided ? 120000 : 300000)) / 60000} мин.</span>
          </div>
        </Card>
        <Card className="p-7">
          <h2 className="font-semibold text-white">Как выполнять</h2>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
            <li>1. Просматривайте знаки по строкам слева направо.</li>
            <li>2. Нажимайте на все буквы А; чтобы зафиксировать просмотр без отметки, выберите «Просмотрено до».</li>
            <li>3. Каждые 30 секунд фиксируется линия и скорость работы.</li>
            {divided && <li>4. Запоминайте появляющиеся сообщения; после двух минут запишите их по одному в строке.</li>}
          </ol>
          <Button size="lg" className="mt-7 w-full" onClick={start} disabled={pending}>
            <Play className="size-4" /> Начать тест
          </Button>
        </Card>
      </div>
      {error && <div className="mt-5"><ErrorNotice message={error} /></div>}
    </section>
  );

  if (attempt.status !== "in_progress") {
    const result = (attempt.result ?? {}) as CorrectionResult;
    const gradeLabels: Record<string, string> = { high: "Высокий", medium: "Средний", low: "Низкий" };
    const gradeLabel = gradeLabels[result.grade] ?? "—";
    return <ResultPanel attempt={attempt} title={title} scoreLabel={divided ? "Общий балл, %" : "Найдено целей, %"} onRepeat={start}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Уровень" value={gradeLabel} />
        <Metric label="Найдено / всего" value={`${result.found ?? 0} / ${result.targets ?? 0}`} />
        <Metric label="Пропуски / лишние отметки" value={`${result.missed ?? 0} / ${result.false_marks ?? 0}`} />
        <Metric label="Скорость, знаков/мин" value={String(result.speed_per_minute ?? 0)} />
        <Metric label="Колебания темпа" value={`${result.fluctuation_percent ?? 0}%`} />
        {divided && <>
          <Metric label="Запоминание" value={`${result.recalled ?? 0} / ${result.statement_count ?? 0}`} />
          <Metric label="Баланс задач" value={`${result.balance ?? 0}%`} />
        </>}
      </div>
      <div className="mt-7">
        <h2 className="text-sm font-semibold text-white">Темп по интервалам 30 секунд</h2>
        <div className="mt-3 flex h-28 items-end gap-1.5" aria-label="Темп по интервалам">
          {result.interval_pace?.map((value, index) => (
            <div key={index} className="flex flex-1 flex-col items-center gap-1 text-xs text-slate-500">
              <span>{value}</span>
              <div className="w-full rounded-t bg-cyan-300/70" style={{ height: `${Math.max(3, value / Math.max(...result.interval_pace, 1) * 70)}px` }} />
              <span>{index + 1}</span>
            </div>
          ))}
        </div>
      </div>
      {divided && <div className="mt-7 text-sm text-slate-400">
        <p>Точность таблицы: {result.table_score ?? 0}% · Запоминание: {result.memory_score ?? 0}%</p>
        {!!result.matches?.length && <p className="mt-3 text-emerald-300">Вспомнено: {result.matches.map((item) => item.statement).join("; ")}</p>}
        {!!result.missed_statements?.length && <p className="mt-3">Пропущено: {result.missed_statements.join("; ")}</p>}
      </div>}
    </ResultPanel>;
  }

  return <section>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <button className="back-link" type="button" onClick={exit} disabled={pending}><ArrowLeft className="size-4" /> Завершить и выйти</button>
        <h1 className="mt-3 text-2xl font-semibold text-white">{title}</h1>
      </div>
      <div className="flex gap-3">
        <div className="rounded-xl border border-white/8 bg-slate-900/80 px-5 py-3 text-center">
          <span className="block text-[10px] text-slate-500 uppercase">Время</span>
          <strong className="font-mono text-lg text-cyan-200"><Clock3 className="mr-2 inline size-4" />{timeLabel(remaining)}</strong>
        </div>
        <div className="rounded-xl border border-white/8 bg-slate-900/80 px-5 py-3 text-center">
          <span className="block text-[10px] text-slate-500 uppercase">Просмотрено</span>
          <strong className="font-mono text-lg text-white">{(task?.cursor ?? -1) + 1} / {task?.cells.length ?? 0}</strong>
        </div>
      </div>
    </div>
    {error && <div className="mb-5"><ErrorNotice message={error} /></div>}
    {task?.stage === "recall" ? <Card className="mx-auto max-w-3xl p-7 sm:p-9">
      <p className="eyebrow">Стоп! · Воспроизведение</p>
      <h2 className="mt-3 text-2xl font-semibold text-white">Что вы запомнили?</h2>
      <p className="mt-3 text-sm text-slate-400">Запишите сообщения по одному в строке. Допускаются небольшие неточности в формулировке.</p>
      <textarea aria-label="Вспомнившиеся сообщения" value={recallText} onChange={(event) => setRecallText(event.target.value)}
        rows={12} className="mt-6 w-full rounded-xl border border-white/12 bg-slate-950/70 p-4 text-white outline-none focus:border-cyan-300/60" />
      <Button className="mt-5" onClick={submitRecall} disabled={pending}>Завершить тест</Button>
    </Card> : <div className={cn("grid gap-5", divided && "xl:grid-cols-[minmax(0,1fr)_290px]")}>
      <Card className="min-w-0 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-semibold text-white">Целевой знак: <span className="text-cyan-200">{task?.target_symbol}</span></p>
            <p className="mt-1 text-xs text-slate-500">Нажимайте на знаки по порядку. Пропущенные цели учитываются в результате.</p></div>
          <div className="flex gap-2" role="group" aria-label="Режим действия">
            <Button size="sm" variant={markMode ? "primary" : "secondary"} onClick={() => setMarkMode(true)}>Отметить</Button>
            <Button size="sm" variant={!markMode ? "primary" : "secondary"} onClick={() => setMarkMode(false)}>Просмотрено до</Button>
          </div>
        </div>
        <div className="overflow-x-auto pb-2">
          <div role="grid" aria-label="Корректурная таблица" className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${task?.grid_columns ?? 20}, minmax(27px, 1fr))`, minWidth: `${(task?.grid_columns ?? 20) * 29}px` }}>
            {task?.cells.map((symbol, position) => {
              const selected = task.selected_positions.includes(position);
              const wrong = task.wrong_positions.includes(position);
              const line = task.line_marks.some((mark) => mark.position === position);
              const passed = position <= task.cursor;
              return <button key={position} type="button" role="gridcell" aria-label={`Знак ${position + 1}: ${symbol}`}
                disabled={pending || passed || remaining <= 0}
                onClick={() => act(position)}
                className={cn("grid aspect-square place-items-center rounded text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-cyan-200",
                  selected ? "bg-cyan-300/25 text-cyan-100" : wrong ? "bg-rose-300/25 text-rose-200" : passed ? "bg-slate-800/30 text-slate-500" : "bg-slate-800/75 text-white hover:bg-cyan-300/15",
                  position === task.cursor && "ring-2 ring-amber-300/70",
                  line && "border-r-4 border-r-amber-300")}>{symbol}</button>;
            })}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-400"><ScanLine className="size-4 text-cyan-200" /> Линия каждые 30 секунд
          {lineNumber > 0 && <span className="ml-auto font-semibold text-amber-200">{elapsed % 30000 < 3000 ? "Линия!" : `Линий: ${Math.min(lineNumber, divided ? 3 : 9)}`}</span>}
        </div>
      </Card>
      {divided && <Card className="flex min-h-56 flex-col p-6">
        <p className="eyebrow">Параллельная задача</p>
        <h2 className="mt-2 text-lg font-semibold text-white">Запоминайте сообщения</h2>
        <div className="my-auto py-8" aria-live="polite">
          {task?.visible_statement ? <>
            <p className="text-xs text-cyan-300">Сообщение {task.visible_statement_number}</p>
            <p className="mt-3 text-xl font-medium leading-7 text-white">{task.visible_statement}</p>
          </> : <p className="text-sm text-slate-500">Следующее сообщение появится здесь.</p>}
        </div>
        <p className="text-xs text-slate-500">Новое сообщение каждые 10 секунд, показ 5 секунд.</p>
      </Card>}
    </div>}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
    <span className="block text-xs text-slate-500">{label}</span>
    <strong className="mt-2 block text-lg text-white">{value}</strong>
  </div>;
}
