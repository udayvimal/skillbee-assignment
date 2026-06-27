"use client";

import type { EvaluationEvent, QuestionEvent } from "@/lib/types";

interface QuestionCardProps {
  question: QuestionEvent;
  evaluation?: EvaluationEvent;
  followUpText?: string | null;
}

const DIFF_COLOR: Record<string, string> = {
  easy:   "text-[#5a9]",
  medium: "text-[#a85]",
  hard:   "text-[#a55]",
};

const SUB_SCORES = [
  { key: "accuracy",      label: "Accuracy"      },
  { key: "communication", label: "Communication" },
  { key: "completeness",  label: "Completeness"  },
  { key: "confidence",    label: "Confidence"    },
  { key: "structure",     label: "Structure"     },
  { key: "examples_used", label: "Examples"      },
] as const;

export function QuestionCard({ question, evaluation, followUpText }: QuestionCardProps) {
  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#111] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-[#555] uppercase tracking-wider">
              Q{question.question_num} of {question.total_questions}
            </span>
            <span className="text-[10px] text-[#444] px-1.5 py-0.5 rounded border border-[#222] bg-[#161616]">
              {question.category}
            </span>
            <span className={`text-[10px] font-medium ${DIFF_COLOR[question.difficulty] ?? "text-[#666]"}`}>
              {question.difficulty}
            </span>
          </div>
          <p className="text-sm text-[#e5e5e5] font-medium leading-relaxed">{question.question_text}</p>
        </div>

        {evaluation && (
          <div className="flex-shrink-0 text-right">
            <span className="text-xl font-semibold text-[#e5e5e5] tabular-nums">
              {evaluation.score.toFixed(1)}
            </span>
            <span className="text-xs text-[#555]">/10</span>
          </div>
        )}
      </div>

      {/* Follow-up */}
      {followUpText && (
        <div className="rounded-lg border border-[#2a2000] bg-[#151100] p-3">
          <p className="text-[10px] text-[#888] uppercase tracking-wider mb-1">Follow-up</p>
          <p className="text-sm text-[#ccc]">{followUpText}</p>
        </div>
      )}

      {/* Evaluation breakdown */}
      {evaluation && (
        <div className="rounded-lg border border-[#1a1a1a] bg-[#0f0f0f] p-3 space-y-3">
          {/* 6 sub-scores */}
          <div className="grid grid-cols-3 gap-x-4 gap-y-2">
            {SUB_SCORES.map(({ key, label }) => {
              const val = evaluation[key as keyof EvaluationEvent] as number | undefined;
              if (val == null) return null;
              return (
                <div key={key} className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#555]">{label}</span>
                    <span className="text-[10px] font-medium text-[#888] tabular-nums">{val.toFixed(1)}</span>
                  </div>
                  <div className="h-0.5 rounded-full bg-[#1e1e1e]">
                    <div
                      className="h-full rounded-full bg-[#444]"
                      style={{ width: `${(val / 10) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Feedback text */}
          <p className="text-xs text-[#888] leading-relaxed border-t border-[#1a1a1a] pt-2">
            {evaluation.feedback}
          </p>

          {/* Strengths + weaknesses */}
          {(evaluation.strengths?.length > 0 || evaluation.weaknesses?.length > 0) && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              {evaluation.strengths?.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#5a9] uppercase tracking-wider mb-1.5">Strengths</p>
                  <ul className="space-y-1">
                    {evaluation.strengths.map((s, i) => (
                      <li key={i} className="text-[10px] text-[#777] flex gap-1.5 leading-relaxed">
                        <span className="text-[#3a7a5a] flex-shrink-0">+</span>{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {evaluation.weaknesses?.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#a55] uppercase tracking-wider mb-1.5">Improve</p>
                  <ul className="space-y-1">
                    {evaluation.weaknesses.map((w, i) => (
                      <li key={i} className="text-[10px] text-[#777] flex gap-1.5 leading-relaxed">
                        <span className="text-[#7a3a3a] flex-shrink-0">−</span>{w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Ideal answer summary */}
          {evaluation.ideal_answer_summary && (
            <div className="pt-1 border-t border-[#1a1a1a]">
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Reference</p>
              <p className="text-[10px] text-[#666] leading-relaxed">{evaluation.ideal_answer_summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
