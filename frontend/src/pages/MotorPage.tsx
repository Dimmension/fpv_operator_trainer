// import { useQueryClient } from "@tanstack/react-query";
// import { ArrowLeft, MousePointer2, Play } from "lucide-react";
// import { useEffect, useRef, useState } from "react";
// import { Link } from "react-router-dom";

// import { api, type AttemptState } from "../api/client";
// import { LoadingState } from "../components/LoadingState";
// import { ResultPanel } from "../components/ResultPanel";
// import { Button } from "../components/ui/button";
// import { Card } from "../components/ui/card";

// export function MotorPage() {
//   const queryClient = useQueryClient();
//   const [attempt, setAttempt] = useState<AttemptState | null>(null);
//   const [pending, setPending] = useState(false);
//   const [isActive, setIsActive] = useState(false);
//   const [progress, setProgress] = useState(0);
  
//   const canvasRef = useRef<HTMLCanvasElement>(null);
//   const dataRef = useRef({ timeOut: 0, errors: 0, smooth: 0 });
//   const linesRef = useRef<any[]>([]);
//   const currentLineIdx = useRef(0);
  
//   // Реф для хранения позиции мыши
//   const mouseRef = useRef({ x: -1, y: -1, tracking: false });

//   const startTest = async () => {
//     setPending(true);
//     try {
//       const state = await api.start("fine-motor-skills");
//       setAttempt(state);
//       linesRef.current = state.task.lines as any[];
//       currentLineIdx.current = 0;
//       setProgress(0);
//       dataRef.current = { timeOut: 0, errors: 0, smooth: 0 };
//       mouseRef.current = { x: -1, y: -1, tracking: false };
//       setIsActive(true);
//     } finally { 
//       setPending(false); 
//     }
//   };

//   const submitResult = async () => {
//     if (!attempt) return;
//     setPending(true);
    
//     // Вычисляем реалистичные данные:
//     const timeActiveMs = dataRef.current.timeOut > 0 ? dataRef.current.timeOut * 2 : 15000; // Примерное общее время
//     const pathPx = dataRef.current.pathLength;
//     const velocity = pathPx / (timeActiveMs / 1000 || 1); // пикселей в сек

//     const state = await api.motorSubmit(attempt.id, {
//       total_time_ms: timeActiveMs,
//       time_out_of_line_ms: dataRef.current.timeOut,
//       error_count: Math.floor(dataRef.current.errors),
//       smoothness_score: Math.max(0, 100 - (dataRef.current.errors * 2)), // Псевдо-оценка плавности
//       path_length_px: pathPx,
//       velocity_px_s: velocity
//     });
//     setAttempt(state);
//     queryClient.invalidateQueries({ queryKey: ["history"] });
//     setPending(false);
//   };


//   // Движок отрисовки (Canvas Loop)
//   useEffect(() => {
//     if (!isActive || !canvasRef.current) return;
//     const canvas = canvasRef.current;
//     const ctx = canvas.getContext("2d");
//     if (!ctx) return;

//     let animationFrameId: number;

//     const render = () => {
//       // Обновляем размер холста, чтобы избежать размытия
//       canvas.width = canvas.clientWidth;
//       canvas.height = canvas.clientHeight;
//       ctx.clearRect(0, 0, canvas.width, canvas.height);

//       const line = linesRef.current[currentLineIdx.current];
//       if (line) {
//         const w = canvas.width;
//         const h = canvas.height;
//         const startX = (line.p0.x / 100) * w;
//         const startY = (line.p0.y / 100) * h;
//         const endX = (line.p3.x / 100) * w;
//         const endY = (line.p3.y / 100) * h;

//         // Рисуем невидимый путь для проверки isPointInStroke
//         ctx.beginPath();
//         ctx.moveTo(startX, startY);
//         ctx.bezierCurveTo((line.p1.x/100)*w, (line.p1.y/100)*h, (line.p2.x/100)*w, (line.p2.y/100)*h, endX, endY);
//         ctx.lineWidth = line.width;

//         const mx = mouseRef.current.x;
//         const my = mouseRef.current.y;

//         // 1. Проверяем, начал ли пользователь вести линию от зеленой точки
//         if (!mouseRef.current.tracking && mx > 0 && my > 0) {
//           if (Math.hypot(startX - mx, startY - my) < line.width) {
//             mouseRef.current.tracking = true;
//           }
//         }

//         // Рисуем саму кривую (видимую)
//         ctx.strokeStyle = mouseRef.current.tracking ? "rgba(103, 232, 249, 0.7)" : "rgba(103, 232, 249, 0.3)";
//         ctx.lineCap = "round";
//         ctx.stroke();

//         // Стартовая точка (Зеленая)
//         ctx.beginPath();
//         ctx.arc(startX, startY, line.width / 2 + 4, 0, Math.PI * 2);
//         ctx.fillStyle = mouseRef.current.tracking ? "rgba(52, 211, 153, 0.3)" : "#34d399";
//         ctx.fill();

//         // Конечная точка (Красная)
//         ctx.beginPath();
//         ctx.arc(endX, endY, line.width / 2 + 4, 0, Math.PI * 2);
//         ctx.fillStyle = "#f43f5e";
//         ctx.fill();

//         // 2. Если пользователь ведет курсор по линии
//         if (mouseRef.current.tracking) {
//           ctx.beginPath();
//           ctx.moveTo(startX, startY);
//           ctx.bezierCurveTo((line.p1.x/100)*w, (line.p1.y/100)*h, (line.p2.x/100)*w, (line.p2.y/100)*h, endX, endY);
//           ctx.lineWidth = line.width;

//           let isOut = false;
//           if (!ctx.isPointInStroke(mx, my)) {
//             dataRef.current.timeOut += 16; // ~16ms (1 кадр)
//             dataRef.current.errors += 0.03; // Накопление штрафа
//             isOut = true;
//           }

//           // Рисуем маркер курсора
//           ctx.beginPath();
//           ctx.arc(mx, my, 6, 0, Math.PI * 2);
//           ctx.fillStyle = isOut ? "rgba(244, 63, 94, 0.9)" : "rgba(255, 255, 255, 0.9)";
//           ctx.fill();

//           // 3. Проверка достижения конца линии
//           if (Math.hypot(endX - mx, endY - my) < line.width) {
//             mouseRef.current.tracking = false;
//             currentLineIdx.current += 1;
            
//             if (currentLineIdx.current >= linesRef.current.length) {
//               setIsActive(false);
//               submitResult();
//             } else {
//               setProgress(currentLineIdx.current);
//             }
//           }
//         } else if (!mouseRef.current.tracking && !isActive && attempt?.status === "in_progress") {
//              // Подсказка начать с зеленой точки
//              ctx.fillStyle = "white";
//              ctx.font = "14px Inter";
//              ctx.fillText("Наведите курсор на зеленую точку", startX + 20, startY + 5);
//         }
//       }

//       animationFrameId = requestAnimationFrame(render);
//     };

//     render();
//     return () => cancelAnimationFrame(animationFrameId);
//   }, [isActive, progress, attempt]); // Перезапуск эффекта при смене линии

//   const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
//     if (!isActive || !canvasRef.current) return;
//     const rect = canvasRef.current.getBoundingClientRect();
//     const x = e.clientX - rect.left;
//     const y = e.clientY - rect.top;
    
//     if (mouseRef.current.tracking) {
//       const dx = x - mouseRef.current.x;
//       const dy = y - mouseRef.current.y;
//       dataRef.current.pathLength = (dataRef.current.pathLength || 0) + Math.hypot(dx, dy);
//     }
    
//     mouseRef.current.x = x;
//     mouseRef.current.y = y;
//   };

//   const handleMouseLeave = () => {
//     // Если курсор ушел с канваса, сбрасываем трекинг
//     mouseRef.current.tracking = false;
//     mouseRef.current.x = -1;
//     mouseRef.current.y = -1;
//   };

//   if (!attempt) return (
//     <section className="mx-auto max-w-4xl">
//       <Link to="/" className="back-link"><ArrowLeft className="size-4" /> К модулям</Link>
//       <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_300px]">
//         <div>
//           <p className="eyebrow">Модуль 06</p>
//           <h1 className="mt-3 text-3xl font-semibold text-white">Мелкая моторика</h1>
//           <p className="mt-4 text-slate-400">Наведите курсор на стартовую зеленую точку и проведите его до красной точки, не выходя за границы голубой линии.</p>
//         </div>
//         <Card className="p-6">
//           <Button size="lg" className="w-full" onClick={startTest} disabled={pending}><Play className="size-4"/> Начать</Button>
//         </Card>
//       </div>
//     </section>
//   );

//   if (attempt.status !== "in_progress") {
//     const res = attempt.result as any;
//     return (
//       <ResultPanel attempt={attempt} title="Анализ моторики" scoreLabel="Коэф. КММ (0-100)" onRepeat={() => setAttempt(null)}>
//         <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
//           <div className="rounded-xl bg-white/[0.035] p-4 text-center">
//             <span className="text-xs text-slate-500">Уровень моторики</span>
//             <strong className="mt-1 block text-xl text-cyan-200">{res.grade === "high" ? "Высокий" : res.grade === "medium" ? "Средний" : "Низкий"}</strong>
//           </div>
//           <div className="rounded-xl bg-white/[0.035] p-4 text-center">
//             <span className="text-xs text-slate-500">Точность удержания</span>
//             <strong className="mt-1 block text-xl text-white">{res.accuracy_percent}%</strong>
//           </div>
//           <div className="rounded-xl bg-white/[0.035] p-4 text-center">
//             <span className="text-xs text-slate-500">Выходов за границы</span>
//             <strong className={cn("mt-1 block text-xl", res.error_count > 0 ? "text-rose-300" : "text-emerald-300")}>{res.error_count}</strong>
//           </div>
//           <div className="rounded-xl bg-white/[0.035] p-4 text-center">
//             <span className="text-xs text-slate-500">Плавность движений</span>
//             <strong className="mt-1 block text-xl text-white">{res.smoothness} / 100</strong>
//           </div>
//         </div>

//         <div className="flex flex-wrap gap-4 text-sm text-slate-400 bg-slate-900/40 rounded-xl p-4 justify-around">
//           <div><span className="text-slate-500">Пройденный путь:</span> <span className="text-slate-200">{res.path_length} px</span></div>
//           <div><span className="text-slate-500">Средняя скорость:</span> <span className="text-slate-200">{res.velocity} px/с</span></div>
//           <div><span className="text-slate-500">Время вне линии:</span> <span className="text-rose-200">{(res.time_out_ms / 1000).toFixed(2)} с</span></div>
//         </div>
//       </ResultPanel>
//     );
//   }

//   return (
//     <section>
//       <div className="mb-4 flex justify-between items-center">
//         <h1 className="text-xl font-semibold text-white flex items-center gap-2"><MousePointer2 className="size-5"/> Пройдите по линии</h1>
//         <div className="text-sm text-cyan-200">Линия {progress + 1} из {linesRef.current.length}</div>
//       </div>
//       <Card className="p-0 overflow-hidden bg-slate-950/50 relative" style={{ height: "60vh" }}>
//         <canvas 
//         ref={canvasRef} 
//         onPointerMove={handlePointerMove}
//         onPointerLeave={handleMouseLeave}
//         className="w-full h-full cursor-crosshair touch-none"
//         />
//         {!isActive && <div className="absolute inset-0 grid place-items-center bg-slate-900/50"><LoadingState label="Анализ результата..." /></div>}
//       </Card>
//     </section>
//   );
// }

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MousePointer2, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api, type AttemptState } from "../api/client";
import { LoadingState } from "../components/LoadingState";
import { ResultPanel } from "../components/ResultPanel";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";

export function MotorPage() {
  const queryClient = useQueryClient();
  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [pending, setPending] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef({ timeOut: 0, errors: 0, smooth: 0, pathLength: 0 });
  const linesRef = useRef<any[]>([]);
  const currentLineIdx = useRef(0);
  
//   const mouseRef = useRef({ x: -1, y: -1, tracking: false });
  
  const mouseRef = useRef({ x: -1, y: -1, tracking: false, wasInStroke: true }); 
  const startTest = async () => {
    setPending(true);
    try {
      const state = await api.start("fine-motor-skills");
      setAttempt(state);
      linesRef.current = state.task.lines as any[];
      currentLineIdx.current = 0;
      setProgress(0);
      dataRef.current = { timeOut: 0, errors: 0, smooth: 0, pathLength: 0 };
      mouseRef.current = { x: -1, y: -1, tracking: false, wasInStroke: true }; 
      setIsActive(true);
    } finally { 
      setPending(false); 
    }
  };

  const submitResult = async () => {
    if (!attempt) return;
    setPending(true);
    
    const timeActiveMs = dataRef.current.timeOut > 0 ? dataRef.current.timeOut * 2 : 15000;
    const pathPx = dataRef.current.pathLength;
    const velocity = pathPx / (timeActiveMs / 1000 || 1);

    const state = await api.motorSubmit(attempt.id, {
      total_time_ms: timeActiveMs,
      time_out_of_line_ms: dataRef.current.timeOut,
      error_count: Math.floor(dataRef.current.errors),
      smoothness_score: Math.max(0, 100 - (dataRef.current.errors * 2)),
      path_length_px: pathPx,
      velocity_px_s: velocity
    });
    setAttempt(state);
    queryClient.invalidateQueries({ queryKey: ["history"] });
    setPending(false);
  };

  useEffect(() => {
    if (!isActive || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const line = linesRef.current[currentLineIdx.current];
      if (line) {
        const w = canvas.width;
        const h = canvas.height;
        const startX = (line.p0.x / 100) * w;
        const startY = (line.p0.y / 100) * h;
        const endX = (line.p3.x / 100) * w;
        const endY = (line.p3.y / 100) * h;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.bezierCurveTo((line.p1.x/100)*w, (line.p1.y/100)*h, (line.p2.x/100)*w, (line.p2.y/100)*h, endX, endY);
        ctx.lineWidth = line.width;

        const mx = mouseRef.current.x;
        const my = mouseRef.current.y;

        if (!mouseRef.current.tracking && mx > 0 && my > 0) {
          if (Math.hypot(startX - mx, startY - my) < line.width) {
            mouseRef.current.tracking = true;
          }
        }

        ctx.strokeStyle = mouseRef.current.tracking ? "rgba(103, 232, 249, 0.7)" : "rgba(103, 232, 249, 0.3)";
        ctx.lineCap = "round";
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(startX, startY, line.width / 2 + 4, 0, Math.PI * 2);
        ctx.fillStyle = mouseRef.current.tracking ? "rgba(52, 211, 153, 0.3)" : "#34d399";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(endX, endY, line.width / 2 + 4, 0, Math.PI * 2);
        ctx.fillStyle = "#f43f5e";
        ctx.fill();

        if (mouseRef.current.tracking) {
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.bezierCurveTo((line.p1.x/100)*w, (line.p1.y/100)*h, (line.p2.x/100)*w, (line.p2.y/100)*h, endX, endY);
          ctx.lineWidth = line.width;

          const inStroke = ctx.isPointInStroke(mx, my);
          
          // Если вышли за пределы ВПЕРВЫЕ за это движение
          if (!inStroke && mouseRef.current.wasInStroke) {
            dataRef.current.errors += 1; // Точно 1 ошибка
          }
          // Пока находимся за пределами - копим время
          if (!inStroke) {
            dataRef.current.timeOut += 16;
          }
          
          mouseRef.current.wasInStroke = inStroke;

          ctx.beginPath();
          ctx.arc(mx, my, 6, 0, Math.PI * 2);
          ctx.fillStyle = !inStroke ? "rgba(244, 63, 94, 0.9)" : "rgba(255, 255, 255, 0.9)";
          ctx.fill();

          if (Math.hypot(endX - mx, endY - my) < line.width) {
            mouseRef.current.tracking = false;
            currentLineIdx.current += 1;
            
            if (currentLineIdx.current >= linesRef.current.length) {
              setIsActive(false);
              void submitResult();
            } else {
              setProgress(currentLineIdx.current);
            }
          }
        } else if (!mouseRef.current.tracking && !isActive && attempt?.status === "in_progress") {
             ctx.fillStyle = "white";
             ctx.font = "14px Inter";
             ctx.fillText("Наведите курсор на зеленую точку", startX + 20, startY + 5);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [isActive, progress, attempt]);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isActive || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (mouseRef.current.tracking) {
      const dx = x - mouseRef.current.x;
      const dy = y - mouseRef.current.y;
      dataRef.current.pathLength = (dataRef.current.pathLength || 0) + Math.hypot(dx, dy);
    }
    
    mouseRef.current.x = x;
    mouseRef.current.y = y;
  };

  const handlePointerLeave = () => {
    mouseRef.current.tracking = false;
    mouseRef.current.x = -1;
    mouseRef.current.y = -1;
  };

  if (!attempt) return (
    <section className="mx-auto max-w-4xl">
      <Link to="/" className="back-link"><ArrowLeft className="size-4" /> К модулям</Link>
      <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_300px]">
        <div>
          <p className="eyebrow">Модуль 06</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Мелкая моторика</h1>
          <p className="mt-4 text-slate-400">Наведите курсор на стартовую зеленую точку и проведите его до красной точки, не выходя за границы голубой линии.</p>
        </div>
        <Card className="p-6">
          <Button size="lg" className="w-full" onClick={startTest} disabled={pending}><Play className="size-4"/> Начать</Button>
        </Card>
      </div>
    </section>
  );

  if (attempt.status !== "in_progress") {
    const res = attempt.result as any;
    return (
      <ResultPanel attempt={attempt} title="Анализ моторики" scoreLabel="Коэф. КММ (0-100)" onRepeat={() => setAttempt(null)}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
          <div className="rounded-xl bg-white/[0.035] p-4 text-center">
            <span className="text-xs text-slate-500">Уровень моторики</span>
            <strong className="mt-1 block text-xl text-cyan-200">{res.grade === "high" ? "Высокий" : res.grade === "medium" ? "Средний" : "Низкий"}</strong>
          </div>
          <div className="rounded-xl bg-white/[0.035] p-4 text-center">
            <span className="text-xs text-slate-500">Точность удержания</span>
            <strong className="mt-1 block text-xl text-white">{res.accuracy_percent}%</strong>
          </div>
          <div className="rounded-xl bg-white/[0.035] p-4 text-center">
            <span className="text-xs text-slate-500">Выходов за границы</span>
            <strong className={cn("mt-1 block text-xl", res.error_count > 0 ? "text-rose-300" : "text-emerald-300")}>{res.error_count}</strong>
          </div>
          <div className="rounded-xl bg-white/[0.035] p-4 text-center">
            <span className="text-xs text-slate-500">Плавность движений</span>
            <strong className="mt-1 block text-xl text-white">{res.smoothness} / 100</strong>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-slate-400 bg-slate-900/40 rounded-xl p-4 justify-around">
          <div><span className="text-slate-500">Пройденный путь:</span> <span className="text-slate-200">{res.path_length} px</span></div>
          <div><span className="text-slate-500">Средняя скорость:</span> <span className="text-slate-200">{res.velocity} px/с</span></div>
          <div><span className="text-slate-500">Время вне линии:</span> <span className="text-rose-200">{(res.time_out_ms / 1000).toFixed(2)} с</span></div>
        </div>
      </ResultPanel>
    );
  }

  return (
    <section>
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold text-white flex items-center gap-2"><MousePointer2 className="size-5"/> Пройдите по линии</h1>
        <div className="text-sm text-cyan-200">Линия {progress + 1} из {linesRef.current.length}</div>
      </div>
      <Card className="p-0 overflow-hidden bg-slate-950/50 relative" style={{ height: "60vh" }}>
        <canvas 
          ref={canvasRef} 
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          className="w-full h-full cursor-crosshair touch-none"
        />
        {!isActive && <div className="absolute inset-0 grid place-items-center bg-slate-900/50"><LoadingState label="Анализ результата..." /></div>}
      </Card>
    </section>
  );
}