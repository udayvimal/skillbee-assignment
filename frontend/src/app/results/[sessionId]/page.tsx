"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { SummaryData } from "@/lib/types";
import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { FullScreenLoader } from "@/components/ui/LoadingSpinner";
import { useInterviewStore } from "@/store/interviewStore";

export default function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const storeSummary = useInterviewStore((s) => s.summary);
  const [summary, setSummary] = useState<SummaryData | null>(storeSummary);
  const [loading, setLoading] = useState(!storeSummary);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (storeSummary) return;
    api.getResults(sessionId)
      .then(setSummary)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sessionId, storeSummary]);

  if (loading) return <FullScreenLoader text="Loading your results" />;

  if (error || !summary) {
    return (
      <div className="min-h-screen bg-[#edf0f7] flex items-center justify-center flex-col gap-4">
        <p className="text-red-500 text-sm">{error || "Results not found."}</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 rounded-xl bg-[#1a2744] text-white text-sm font-semibold hover:bg-[#1e3056] transition-colors"
        >
          Start New Interview
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#edf0f7]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#1a2744] flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-[#1a2744]">TechMind AI</span>
            <span className="text-gray-300">/</span>
            <span className="text-xs text-gray-400">Interview Report</span>
          </div>
          <button
            onClick={() => { useInterviewStore.getState().reset(); router.push("/"); }}
            className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors font-medium"
          >
            New Interview
          </button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <AnalyticsDashboard summary={summary} />
      </main>
    </div>
  );
}
