"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Difficulty, Language, Role } from "@/lib/types";

const ROLES: { value: Role; label: string; sub: string }[] = [
  { value: "backend",       label: "Backend",    sub: "APIs · DBs · Systems" },
  { value: "frontend",      label: "Frontend",   sub: "React · CSS · Perf" },
  { value: "fullstack",     label: "Full-Stack", sub: "End-to-end" },
  { value: "data_engineer", label: "Data Eng.",  sub: "SQL · Pipelines" },
  { value: "devops",        label: "DevOps",     sub: "CI/CD · Cloud" },
  { value: "general",       label: "General",    sub: "Broad scope" },
];

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi"   },
  { value: "de", label: "German"  },
];

const DIFFICULTIES: { value: Difficulty; label: string; sub: string }[] = [
  { value: "easy",   label: "Junior",    sub: "0–2 yrs" },
  { value: "medium", label: "Mid-level", sub: "2–5 yrs" },
  { value: "hard",   label: "Senior",    sub: "5+ yrs"  },
];

const FEATURES = [
  { label: "Groq Whisper STT",  detail: "Real-time voice transcription, <300ms latency" },
  { label: "RAG Evaluation",    detail: "FAISS + LLaMA 3.3 70B against reference answers" },
  { label: "3-Tier Feedback",   detail: "Score routes: advance (≥8), probe (5–8), teach (<5)" },
  { label: "6 Evaluation Axes", detail: "Accuracy, communication, completeness, confidence, structure, examples" },
  { label: "Neural TTS",        detail: "Microsoft Neural voices — English, Hindi, German" },
  { label: "PDF Report",        detail: "Radar charts, ideal answers, and improvement suggestions" },
];

export default function LandingPage() {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [form,    setForm]    = useState({
    candidate_name: "",
    role:           "backend"  as Role,
    language:       "en"       as Language,
    difficulty:     "medium"   as Difficulty,
    question_count: 3,
  });

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleStart = async () => {
    if (!form.candidate_name.trim()) { setError("Enter your name to continue."); return; }
    setLoading(true);
    setError("");
    try {
      const session = await api.createSession(form);
      router.push(`/interview?session=${session.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not reach the server — is the backend running?");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#edf0f7]">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1a2744] flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-[#1a2744] tracking-tight">TechMind AI</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5">
            {["Groq Whisper", "LLaMA 3.3 70B", "FAISS RAG"].map((t) => (
              <span key={t} className="text-[10px] text-gray-400 px-2 py-1 rounded-full bg-gray-100 border border-gray-200">{t}</span>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main two-column ─────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

          {/* Left: info */}
          <div className="lg:col-span-2 space-y-5">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-[#1a2744] leading-snug">
                AI Technical<br />Interviews, Done Right.
              </h1>
              <p className="text-sm text-gray-500 leading-relaxed">
                Speak your answers naturally. Every response is evaluated against curated
                reference answers — grounded scores, not guesses.
              </p>
            </div>

            {/* Feature list */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              {FEATURES.map((f, i) => (
                <div
                  key={f.label}
                  className={`flex gap-3 px-4 py-3 ${i < FEATURES.length - 1 ? "border-b border-gray-100" : ""}`}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] mt-[5px] flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-gray-700">{f.label}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{f.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[{ n: "31", label: "Q&A pairs" }, { n: "6", label: "Roles" }, { n: "3", label: "Languages" }].map((s) => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-center">
                  <div className="text-lg font-bold text-[#1a2744]">{s.n}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: form */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
            <div className="pb-1">
              <h2 className="text-base font-bold text-[#1a2744]">Configure your interview</h2>
              <p className="text-xs text-gray-400 mt-1">Fields affect question selection and narration language.</p>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500">Full name</label>
              <input
                type="text"
                value={form.candidate_name}
                onChange={(e) => set("candidate_name", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
                placeholder="e.g. Ayush Sharma"
                maxLength={100}
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-300 outline-none focus:border-[#10b981] focus:ring-2 focus:ring-[#10b981]/10 transition-all"
              />
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-500">Target role</label>
              <div className="grid grid-cols-3 gap-1.5">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => set("role", r.value)}
                    className={`flex flex-col gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-all text-xs ${
                      form.role === r.value
                        ? "border-[#10b981] bg-[#10b981]/6 text-[#1a2744]"
                        : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    }`}
                  >
                    <span className="font-semibold text-[11px]">{r.label}</span>
                    <span className="text-[10px] opacity-60 leading-tight">{r.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty + Language */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500">Experience level</label>
                <div className="space-y-1">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => set("difficulty", d.value)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-xs transition-all ${
                        form.difficulty === d.value
                          ? "border-[#10b981] bg-[#10b981]/6 text-[#1a2744]"
                          : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      <span className="font-semibold">{d.label}</span>
                      <span className="text-[10px] opacity-50">{d.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-500">Language</label>
                <div className="space-y-1">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.value}
                      onClick={() => set("language", l.value)}
                      className={`w-full flex items-center px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                        form.language === l.value
                          ? "border-[#10b981] bg-[#10b981]/6 text-[#1a2744]"
                          : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Questions count */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-500">Number of questions</label>
                <span className="text-xs font-bold text-[#1a2744] tabular-nums">
                  {form.question_count} &nbsp;
                  <span className="text-gray-400 font-normal">
                    (~{form.question_count * 5} min)
                  </span>
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[3, 5, 7, 10, 15].map((n) => (
                  <button
                    key={n}
                    onClick={() => set("question_count", n)}
                    className={`px-4 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      form.question_count === n
                        ? "border-[#10b981] bg-[#10b981]/10 text-[#10b981]"
                        : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="px-3 py-2.5 rounded-xl border border-red-200 bg-red-50 text-xs text-red-600">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleStart}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#1a2744] text-white text-sm font-bold transition-all hover:bg-[#1e3056] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 12 0 12 12h-4z" />
                  </svg>
                  Preparing session
                </>
              ) : "Begin Interview"}
            </button>

            <p className="text-[10px] text-gray-400 text-center">
              Microphone access required. Questions are tailored to your role and experience level.
            </p>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white/60 mt-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-[10px] text-gray-400">TechMind AI — AI Voice Interview Platform</span>
          <span className="text-[10px] text-gray-400">FastAPI · Next.js 15 · Groq · LLaMA 3.3 · FAISS</span>
        </div>
      </footer>
    </div>
  );
}
