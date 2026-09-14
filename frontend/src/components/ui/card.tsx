import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-slate-900/70 shadow-[0_20px_80px_rgba(0,0,0,.22)] backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}
