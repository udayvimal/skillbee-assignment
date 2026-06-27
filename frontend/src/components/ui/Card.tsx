import { type HTMLAttributes } from "react";
import { clsx } from "clsx";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export function Card({ glow, className, children, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-surface-border bg-surface-card p-6",
        glow && "shadow-lg shadow-brand-900/30 border-brand-900/50",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
