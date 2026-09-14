import { ArrowRight, CheckCircle2, Gauge, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { AttemptState } from "../api/client";
import { formatDuration } from "../lib/utils";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

export function ResultPanel({
  attempt,
  title,
  scoreLabel,
  onRepeat,
  children,
}: {
  attempt: AttemptState;
  title: string;
  scoreLabel: string;
  onRepeat: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-4xl animate-[rise_.45s_ease-out]">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-5 grid size-16 place-items-center rounded-full border border-emerald-300/25 bg-emerald-300/10 text-emerald-300">
          <CheckCircle2 className="size-8" />
        </span>
        <p className="eyebrow">Диагностика завершена</p>
        <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">{title}</h1>
      </div>
      <Card className="overflow-hidden">
        <div className="grid gap-px bg-white/8 sm:grid-cols-3">
          <div className="bg-slate-950/80 p-6 text-center">
            <span className="text-xs tracking-widest text-slate-500 uppercase">{scoreLabel}</span>
            <strong className="mt-2 block text-4xl font-semibold text-cyan-200">
              {Math.round(attempt.metrics.score ?? 0)}
            </strong>
          </div>
          <div className="bg-slate-950/80 p-6 text-center">
            <span className="text-xs tracking-widest text-slate-500 uppercase">Точность</span>
            <strong className="mt-2 block text-4xl font-semibold text-white">
              {Math.round(attempt.metrics.accuracy ?? 0)}%
            </strong>
          </div>
          <div className="bg-slate-950/80 p-6 text-center">
            <span className="text-xs tracking-widest text-slate-500 uppercase">Время</span>
            <strong className="mt-2 block text-4xl font-semibold text-white">
              {formatDuration(attempt.duration_ms)}
            </strong>
          </div>
        </div>
        {children && <div className="border-t border-white/8 p-6 sm:p-8">{children}</div>}
      </Card>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Button onClick={onRepeat} variant="secondary" size="lg">
          <RotateCcw className="size-4" /> Повторить
        </Button>
        <Button asChild size="lg">
          <Link to="/history">
            История результатов <Gauge className="size-4" />
          </Link>
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link to="/">
            К модулям <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
