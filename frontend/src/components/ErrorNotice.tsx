import { AlertTriangle } from "lucide-react";

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-400/8 p-4 text-sm text-rose-100"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
