"use client";

interface ProgressBarProps {
  current: number;
  total: number;
  category?: string;
  difficulty?: string;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.min((current / total) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#555] whitespace-nowrap tabular-nums">
        {Math.min(current, total)}/{total}
      </span>
      <div className="w-20 h-1 rounded-full bg-[#222] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#555] transition-all duration-700"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={current}
          aria-valuemax={total}
        />
      </div>
    </div>
  );
}
