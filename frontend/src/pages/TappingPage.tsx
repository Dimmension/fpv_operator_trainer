import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api, type AttemptState } from "../api/client";
import { ResultPanel } from "../components/ResultPanel";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";

function MetricCard({ label, value, color = "text-white" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.035] p-4 text-center">
      <span className="text-xs text-slate-500">{label}</span>
      <strong className={cn("mt-1 block text-2xl font-semibold", color)}>{value}</strong>
    </div>
  );
}

export function TappingPage() {
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  
  const [activeSquare, setActiveSquare] = useState(0);
  const intervalsRef = useRef<number[]>([0,0,0,0,0,0]);
  const attemptIdRef = useRef<number | null>(null);
  const [clicks, setClicks] = useState(0);

  useEffect(() => {
    if (phase !== "running") return;
    
    const intervalTime = 5000;
    const totalIntervals = 6;
    let currentIdx = 0;
    
    const finishTest = async () => {
      if (!attemptIdRef.current) return;
      setPhase("done");
      setPending(true);
      try {
        const state = await api.tappingSubmit(attemptIdRef.current, intervalsRef.current);
        setAttempt(state);
        queryClient.invalidateQueries({ queryKey: ["history"] });
      } finally { 
        setPending(false); 
      }
    };

    const timer = setInterval(() => {
      currentIdx++;
      if (currentIdx >= totalIntervals) {
        clearInterval(timer);
        void finishTest();
      } else {
        setActiveSquare(currentIdx);
        setClicks(0); 
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [phase, queryClient]);

  const startTest = async () => {
    setPending(true);
    try {
      const state = await api.start("nervous-system");
      setAttempt(state);
      attemptIdRef.current = state.id;
      intervalsRef.current = [0,0,0,0,0,0];
      setActiveSquare(0);
      setClicks(0);
      setPhase("running");
    } finally { setPending(false); }
  };

  const handleClick = (index: number) => {
    if (phase !== "running" || index !== activeSquare) return;
    const currentVal = intervalsRef.current[activeSquare] ?? 0;
    intervalsRef.current[activeSquare] = currentVal + 1;
    setClicks(prev => prev + 1);
  };

  if (!attempt || phase === "idle") return (
    <section className="mx-auto max-w-4xl">
      <Link to="/" className="back-link"><ArrowLeft className="size-4" /> К модулям</Link>
      <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_300px]">
        <div>
          <p className="eyebrow">Модуль 07</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Состояние нервной системы</h1>
          <p className="mt-4 text-slate-400">Теппинг-тест Е.П. Ильина. Кликайте максимально быстро в подсвеченном квадрате. Квадрат меняется каждые 5 секунд (всего 30 секунд).</p>
        </div>
        <Card className="p-6">
          <Button size="lg" className="w-full" onClick={startTest} disabled={pending}><Play className="size-4"/> Начать 30-секундный тест</Button>
        </Card>
      </div>
    </section>
  );

if (attempt.status !== "in_progress") {
    const res = attempt.result as any;
    return (
      <ResultPanel 
        attempt={attempt} 
        title="Тест завершен" 
        onRepeat={() => setPhase("idle")}
        hideDefaultStats={true}
        customHeaderStats={
          <>
            <div className="bg-slate-950/80 p-6 text-center">
              <span className="text-xs tracking-widest text-slate-500 uppercase">Индекс утомления</span>
              <strong className={cn("mt-2 block text-4xl font-semibold", res.fatigue_index > 20 ? "text-rose-300" : "text-emerald-300")}>
                {res.fatigue_index}%
              </strong>
            </div>
            <div className="bg-slate-950/80 p-6 text-center">
              <span className="text-xs tracking-widest text-slate-500 uppercase">Устойчивость</span>
              <strong className="mt-2 block text-4xl font-semibold text-cyan-200">
                {res.stability}%
              </strong>
            </div>
          </>
        }
      >
        <div className="text-center mb-8">
          <h3 className="text-2xl text-cyan-300 font-semibold">{res.curve_type} тип</h3>
          <p className="text-sm text-slate-400 mt-2 max-w-2xl mx-auto">{res.description}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <MetricCard label="В среднем за 5с" value={res.average} />
          <MetricCard label="Пик (макс)" value={res.max} />
          <MetricCard label="Всего кликов" value={res.total} />
        </div>

        <div className="grid grid-cols-6 gap-2 h-32 items-end border-b border-white/10 pb-2">
          {res.intervals.map((val: number, i: number) => (
            <div key={i} className="flex flex-col items-center">
              <span className="text-xs font-mono text-cyan-100 mb-1">{val}</span>
              <div className="w-full max-w-[40px] bg-cyan-500/80 rounded-t transition-all" style={{ height: `${(val / Math.max(...res.intervals)) * 100}%` }}></div>
              <span className="text-[10px] text-slate-500 mt-2">{i*5}-{i*5+5}с</span>
            </div>
          ))}
        </div>
      </ResultPanel>
    );
  }

  return (
    <section>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-white animate-pulse">Кликайте как можно быстрее!</h1>
        <p className="text-cyan-300 mt-2 text-xl font-mono">Интервал {activeSquare + 1} / 6</p>
      </div>
      <Card className="p-4 mx-auto max-w-2xl">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 aspect-video">
          {[0,1,2,3,4,5].map((i) => (
            <button key={i} onPointerDown={() => handleClick(i)} disabled={i !== activeSquare || phase !== "running"}
              className={cn(
                "rounded-xl border-2 transition-all flex items-center justify-center text-4xl select-none touch-none",
                i === activeSquare ? "bg-cyan-900/60 border-cyan-400 text-white active:bg-cyan-400/50 active:scale-95 shadow-[0_0_20px_rgba(34,211,238,0.3)]" : "bg-slate-900/40 border-slate-800 text-transparent"
              )}>
              {i === activeSquare ? clicks : ""}
            </button>
          ))}
        </div>
      </Card>
    </section>
  );
}