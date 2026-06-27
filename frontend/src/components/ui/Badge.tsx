import { clsx } from "clsx";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "purple";

const VARIANTS: Record<BadgeVariant, string> = {
  default:  "bg-slate-700 text-slate-200",
  success:  "bg-emerald-900/60 text-emerald-300 border border-emerald-700/40",
  warning:  "bg-amber-900/60 text-amber-300 border border-amber-700/40",
  error:    "bg-red-900/60 text-red-300 border border-red-700/40",
  info:     "bg-blue-900/60 text-blue-300 border border-blue-700/40",
  purple:   "bg-brand-900/60 text-brand-300 border border-brand-700/40",
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ label, variant = "default", className }: BadgeProps) {
  return (
    <span className={clsx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", VARIANTS[variant], className)}>
      {label}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const variant =
    score >= 8 ? "success" :
    score >= 6 ? "info" :
    score >= 4 ? "warning" : "error";
  return <Badge label={`${score.toFixed(1)}/10`} variant={variant} />;
}
