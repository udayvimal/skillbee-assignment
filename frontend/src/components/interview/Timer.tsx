"use client";

interface TimerProps {
  seconds: number;
  max: number;
  isActive: boolean;
}

export function Timer({ seconds, max, isActive }: TimerProps) {
  if (!isActive) return null;

  const remaining = Math.max(max - seconds, 0);
  const pct       = Math.min((seconds / max) * 100, 100);
  const isWarning = remaining <= 20;
  const isDanger  = remaining <= 10;

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-mono font-semibold tabular-nums ${isDanger ? "text-red-500" : isWarning ? "text-amber-500" : "text-gray-500"}`}>
        {fmt(remaining)}
      </span>
      <div className="w-20 h-1 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${isDanger ? "bg-red-500" : isWarning ? "bg-amber-400" : "bg-[#10b981]"}`}
          style={{ width: `${100 - pct}%` }}
        />
      </div>
    </div>
  );
}
