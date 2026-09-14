export function LoadingState({ label = "Загрузка данных" }: { label?: string }) {
  return (
    <div className="grid min-h-64 place-items-center" role="status">
      <div className="text-center">
        <span className="mx-auto mb-4 block size-9 animate-spin rounded-full border-2 border-white/15 border-t-cyan-300" />
        <p className="text-sm text-slate-400">{label}…</p>
      </div>
    </div>
  );
}
