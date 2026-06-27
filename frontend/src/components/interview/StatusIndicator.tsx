"use client";

import { clsx } from "clsx";
import type { InterviewState } from "@/lib/types";

const STATE_CONFIG: Record<
  InterviewState,
  { label: string; dotColor: string; pulse: boolean }
> = {
  IDLE:       { label: "Ready",       dotColor: "bg-[#444]",   pulse: false },
  INTRO:      { label: "Introduction",dotColor: "bg-[#888]",   pulse: true  },
  QUESTION:   { label: "Question",    dotColor: "bg-[#888]",   pulse: false },
  LISTENING:  { label: "Listening",   dotColor: "bg-[#5a9]",   pulse: true  },
  PROCESSING: { label: "Processing",  dotColor: "bg-[#a85]",   pulse: true  },
  EVALUATING: { label: "Evaluating",  dotColor: "bg-[#888]",   pulse: true  },
  FOLLOW_UP:  { label: "Follow-up",   dotColor: "bg-[#a85]",   pulse: false },
  TEACHING:   { label: "Review",      dotColor: "bg-[#a85]",   pulse: false },
  SUMMARY:    { label: "Summary",     dotColor: "bg-[#888]",   pulse: false },
  COMPLETE:   { label: "Complete",    dotColor: "bg-[#5a9]",   pulse: false },
};

interface StatusIndicatorProps {
  state: InterviewState;
  isAgentSpeaking?: boolean;
}

export function StatusIndicator({ state, isAgentSpeaking }: StatusIndicatorProps) {
  const cfg = STATE_CONFIG[state] ?? STATE_CONFIG.IDLE;
  const label = isAgentSpeaking ? "Speaking" : cfg.label;
  const pulse = cfg.pulse || !!isAgentSpeaking;

  return (
    <div className="flex items-center gap-2">
      <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", cfg.dotColor, pulse && "animate-pulse")} />
      <span className="text-xs text-[#666]">{label}</span>
    </div>
  );
}
