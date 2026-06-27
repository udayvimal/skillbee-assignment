"use client";

import { useCallback, useState } from "react";
import {
  Bar, BarChart, PolarAngleAxis, PolarGrid, Radar, RadarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { SummaryData } from "@/lib/types";
import { PDFExportButton } from "./PDFExport";

interface AnalyticsDashboardProps { summary: SummaryData }

const HIRING_CONFIG = {
  strong_yes: { label: "Strong Hire",  bg: "bg-emerald-50 border-emerald-200",  text: "text-emerald-700" },
  yes:        { label: "Hire",         bg: "bg-blue-50 border-blue-200",         text: "text-blue-700"    },
  maybe:      { label: "Consider",     bg: "bg-amber-50 border-amber-200",       text: "text-amber-700"   },
  no:         { label: "Not Yet",      bg: "bg-red-50 border-red-200",           text: "text-red-700"     },
};

const SUB_SCORES = [
  { key: "accuracy",      label: "Accuracy",      weight: "35%" },
  { key: "communication", label: "Communication", weight: "20%" },
  { key: "completeness",  label: "Completeness",  weight: "25%" },
  { key: "confidence",    label: "Confidence",    weight: "10%" },
  { key: "structure",     label: "Structure",     weight: "5%"  },
  { key: "examples_used", label: "Examples",      weight: "5%"  },
] as const;

function TTSButton({ summary }: { summary: SummaryData }) {
  const [reading, setReading] = useState(false);

  const readReport = useCallback(() => {
    if (!window.speechSynthesis) return;
    if (reading) { window.speechSynthesis.cancel(); setReading(false); return; }
    const lines = [
      `Interview report for ${summary.candidate_name}, applying for ${summary.role}.`,
      `Overall score: ${summary.overall_score.toFixed(1)} out of 10. Grade: ${summary.grade}.`,
      summary.overall_impression ? `Overall impression: ${summary.overall_impression}` : "",
      `Top strengths: ${summary.strengths.slice(0, 3).join(". ")}.`,
      `Areas to improve: ${summary.weaknesses.slice(0, 3).join(". ")}.`,
      `Recommendation: ${HIRING_CONFIG[summary.hiring_signal ?? "maybe"]?.label ?? "Consider"}.`,
    ].filter(Boolean).join(" ");

    const utt    = new SpeechSynthesisUtterance(lines);
    utt.rate     = 0.95;
    utt.onend    = () => setReading(false);
    utt.onerror  = () => setReading(false);
    setReading(true);
    window.speechSynthesis.speak(utt);
  }, [reading, summary]);

  return (
    <button
      onClick={readReport}
      className="px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors flex items-center gap-1.5"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={reading
          ? "M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
          : "M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
        } />
      </svg>
      {reading ? "Stop" : "Read Report"}
    </button>
  );
}

export function AnalyticsDashboard({ summary }: AnalyticsDashboardProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const radarData = summary.category_scores.map((c) => ({
    category: c.category.replace(/_/g, " "),
    score: c.score,
    fullMark: 10,
  }));

  const hiringCfg = HIRING_CONFIG[summary.hiring_signal ?? "maybe"];
  const mainEvals = summary.evaluations.filter((e) => !e.is_follow_up);

  const scoreColor = (s: number) =>
    s >= 8 ? "text-emerald-600" : s >= 5 ? "text-amber-600" : "text-red-500";

  return (
    <div id="analytics-dashboard" className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#1a2744]">{summary.candidate_name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {summary.role} · {summary.interview_duration_minutes} min ·{" "}
            {new Date(summary.completed_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TTSButton summary={summary} />
          <PDFExportButton />
          <div className={`px-3 py-1.5 rounded-xl border text-xs font-semibold ${hiringCfg.bg} ${hiringCfg.text}`}>
            {hiringCfg.label}
          </div>
        </div>
      </div>

      {/* Overall impression */}
      {summary.overall_impression && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 border-l-4 border-l-[#10b981]">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Overall Impression</p>
          <p className="text-sm text-gray-700 leading-relaxed">{summary.overall_impression}</p>
        </div>
      )}

      {/* Score cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Score", value: summary.overall_score.toFixed(1), sub: "out of 10" },
          { label: "Grade", value: summary.grade, sub: "overall" },
          { label: "Questions", value: String(mainEvals.length), sub: "answered" },
          { label: "Duration", value: `${summary.interview_duration_minutes}m`, sub: "total" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-center">
            <p className={`text-3xl font-black ${scoreColor(summary.overall_score)} ${s.label === "Grade" ? "" : ""}`}>{s.value}</p>
            <p className="text-[10px] text-gray-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Category Performance</h3>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="category" tick={{ fill: "#9ca3af", fontSize: 10 }} />
              <Radar name="Score" dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
              <Tooltip
                contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}
                labelStyle={{ color: "#374151" }}
                itemStyle={{ color: "#10b981" }}
                formatter={(v: number) => [`${v.toFixed(1)}/10`, "Score"]}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Category Breakdown</h3>
          {summary.category_scores.map((c) => (
            <div key={c.category} className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-600 capitalize">{c.category.replace(/_/g, " ")}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">{c.question_count} q</span>
                  <span className={`font-semibold tabular-nums ${scoreColor(c.score)}`}>{c.score.toFixed(1)}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-[#10b981] transition-all" style={{ width: `${(c.score / 10) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strengths + Weaknesses */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
          <h3 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Key Strengths</h3>
          {summary.strengths.length > 0 ? (
            <ul className="space-y-2">
              {summary.strengths.slice(0, 5).map((s, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-600">
                  <span className="text-emerald-500 flex-shrink-0 font-bold">+</span>{s}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-gray-400">No specific strengths recorded.</p>}
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
          <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wider">Areas to Improve</h3>
          {summary.weaknesses.length > 0 ? (
            <ul className="space-y-2">
              {summary.weaknesses.slice(0, 5).map((w, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-600">
                  <span className="text-red-400 flex-shrink-0">→</span>{w}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-gray-400">No significant gaps identified.</p>}
        </div>
      </div>

      {/* Study recommendations */}
      {summary.improvement_suggestions.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
          <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Study Recommendations</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {summary.improvement_suggestions.map((s, i) => (
              <div key={i} className="flex gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl p-3 border border-gray-100">
                <span className="text-amber-500 flex-shrink-0 font-bold">{i + 1}.</span>{s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-question breakdown */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Question-by-Question
          <span className="text-gray-300 font-normal ml-2">— click to expand</span>
        </h3>
        <div className="space-y-2">
          {mainEvals.map((e, i) => {
            const key    = e.question_id + i;
            const isOpen = expanded === key;
            return (
              <div key={key} className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[10px] font-bold text-gray-400 flex-shrink-0">Q{i + 1}</span>
                    <span className="text-[10px] text-gray-500 px-2 py-0.5 rounded-full bg-gray-200 flex-shrink-0">{e.category}</span>
                    <p className="text-sm text-gray-700 truncate">{e.question_text}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className={`text-sm font-bold tabular-nums ${scoreColor(e.score)}`}>{e.score.toFixed(1)}</span>
                    <span className={`text-gray-400 text-xs transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-2 space-y-4 border-t border-gray-200 bg-white">
                    {/* Sub-score chart */}
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Sub-scores</p>
                      <div className="h-36">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={SUB_SCORES.map((s) => ({
                              name: s.label,
                              score: (e as Record<string, unknown>)[s.key] as number ?? 0,
                            }))}
                            margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
                          >
                            <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 9 }} />
                            <YAxis domain={[0, 10]} tick={{ fill: "#9ca3af", fontSize: 9 }} />
                            <Tooltip
                              contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8 }}
                              formatter={(v: number) => [`${v.toFixed(1)}/10`]}
                            />
                            <Bar dataKey="score" fill="#10b981" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Your answer */}
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Your Answer</p>
                      <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 border border-gray-100 rounded-lg p-3">
                        {e.answer_text || "No answer provided"}
                      </p>
                    </div>

                    {/* Ideal answer */}
                    {e.ideal_answer && (
                      <div>
                        <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Ideal Answer</p>
                        <p className="text-sm text-gray-700 leading-relaxed bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                          {e.ideal_answer}
                        </p>
                      </div>
                    )}

                    {/* Feedback */}
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">AI Feedback</p>
                      <p className="text-sm text-gray-600 leading-relaxed">{e.feedback}</p>
                    </div>

                    {/* Strengths / weaknesses */}
                    {(e.strengths.length > 0 || e.weaknesses.length > 0) && (
                      <div className="grid sm:grid-cols-2 gap-3">
                        {e.strengths.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-emerald-600 mb-1">Strengths</p>
                            {e.strengths.map((s, j) => (
                              <p key={j} className="text-xs text-gray-500 flex gap-1 mb-0.5"><span className="text-emerald-500">+</span>{s}</p>
                            ))}
                          </div>
                        )}
                        {e.weaknesses.length > 0 && (
                          <div>
                            <p className="text-[10px] font-semibold text-red-500 mb-1">Gaps</p>
                            {e.weaknesses.map((w, j) => (
                              <p key={j} className="text-xs text-gray-500 flex gap-1 mb-0.5"><span className="text-red-400">→</span>{w}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
