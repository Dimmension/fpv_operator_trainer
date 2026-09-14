import { cn } from "../lib/utils";
import type { ShapeName } from "./shapeTypes";

export function Shape({ shape, className }: { shape: ShapeName; className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("size-10 fill-none stroke-current stroke-[8]", className)}
      aria-hidden="true"
    >
      {shape === "circle" && <circle cx="50" cy="50" r="34" />}
      {shape === "triangle" && <path d="M50 13 89 84H11Z" strokeLinejoin="round" />}
      {shape === "square" && <rect x="17" y="17" width="66" height="66" rx="2" />}
      {shape === "rectangle" && <rect x="10" y="28" width="80" height="44" rx="2" />}
      {shape === "cross" && <path d="M50 13v74M13 50h74" strokeLinecap="square" />}
    </svg>
  );
}
