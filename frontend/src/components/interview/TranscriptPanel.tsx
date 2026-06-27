"use client";

import { useEffect, useRef } from "react";
import type { TranscriptEntry } from "@/lib/types";

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
  className?: string;
}

export function TranscriptPanel({ entries, className }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  if (!entries.length) {
    return (
      <div className={`flex items-center justify-center text-[#3a3a3a] text-xs ${className ?? ""}`}>
        Transcript appears here once the interview starts.
      </div>
    );
  }

  return (
    <div className={`space-y-3 overflow-y-auto ${className ?? ""}`}>
      {entries.map((entry, i) => (
        <div
          key={i}
          className={`flex gap-2.5 ${entry.role === "user" ? "flex-row-reverse" : "flex-row"}`}
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0 mt-0.5 ${
              entry.role === "agent"
                ? "bg-[#222] text-[#888] border border-[#2a2a2a]"
                : "bg-[#1a1a1a] text-[#777] border border-[#2a2a2a]"
            }`}
          >
            {entry.role === "agent" ? "AI" : "U"}
          </div>

          <div className={`max-w-[85%] space-y-1 ${entry.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                entry.role === "agent"
                  ? "bg-[#161616] border border-[#1f1f1f] text-[#ccc]"
                  : "bg-[#1a1a1a] border border-[#222] text-[#bbb]"
              }`}
            >
              {entry.text}
            </div>
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] text-[#3a3a3a]">
                {entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              {entry.evaluation && (
                <span className="text-[10px] text-[#666] tabular-nums">
                  {entry.evaluation.score.toFixed(1)}/10
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
