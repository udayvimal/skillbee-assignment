"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useInterview } from "@/hooks/useInterview";
import { useInterviewStore } from "@/store/interviewStore";
import { AudioWaveform } from "./AudioWaveform";

interface InterviewRoomProps { sessionId: string }

const STEPS = [
  { n: "01", title: "Listen to each question", desc: "The AI speaks the question aloud and displays it on screen. Wait until it finishes before responding." },
  { n: "02", title: "Click Start Speaking",     desc: "Speak clearly at a natural pace. Groq Whisper transcribes your voice in real time." },
  { n: "03", title: "Click Done Speaking",      desc: "Your answer is submitted. Detailed feedback arrives in a few seconds." },
  { n: "04", title: "30-second auto-advance",   desc: "After the AI finishes speaking, a visible countdown starts. If you don't respond, the question is skipped." },
  { n: "05", title: "Download your report",     desc: "A full analytics report with scores, ideal answers, strengths, and improvement suggestions is generated at the end." },
];

const NAV_ICONS = [
  { label: "Interview", path: "M3 7a1 1 0 011-1h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7zm2 1v8h14V8H5zm3 2h8v1H8v-1zm0 3h6v1H8v-1z" },
  { label: "Notes",     path: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { label: "Report",    path: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
];

export function InterviewRoom({ sessionId }: InterviewRoomProps) {
  const router = useRouter();

  const {
    interviewState, currentQuestion, transcript,
    isRecording, isAgentSpeaking, isProcessing,
    userTranscript, followUpText,
  } = useInterviewStore();

  const { wsStatus, isPlaying, audioLevel, duration, startInterview, skipQuestion, startRecording, stopRecording } = useInterview(sessionId);

  // ── Sync fix: countdown only after agent finishes speaking ─────────────────
  const agentWasSpeakingRef  = useRef(false);
  const [readyForAnswer, setReadyForAnswer] = useState(false);
  const [countdown,      setCountdown]      = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const isSpeaking  = isAgentSpeaking || isPlaying;
    const wasSpeaking = agentWasSpeakingRef.current;
    agentWasSpeakingRef.current = isSpeaking;
    if (!isSpeaking && wasSpeaking && interviewState === "LISTENING" && !isRecording)
      setReadyForAnswer(true);
  }, [isAgentSpeaking, isPlaying, interviewState, isRecording]);

  useEffect(() => {
    if (interviewState !== "LISTENING" || isRecording) setReadyForAnswer(false);
  }, [interviewState, isRecording]);

  useEffect(() => {
    setReadyForAnswer(false);
    agentWasSpeakingRef.current = false;
  }, [currentQuestion?.question_id]);

  useEffect(() => {
    if (!readyForAnswer) {
      clearInterval(countdownRef.current ?? undefined);
      countdownRef.current = null;
      setCountdown(null);
      return;
    }
    setCountdown(30);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          skipQuestion();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current ?? undefined);
  }, [readyForAnswer, skipQuestion]);

  // ── Session elapsed timer ──────────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (interviewState !== "IDLE" && interviewState !== "COMPLETE" && !elapsedRef.current)
      elapsedRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    if (interviewState === "COMPLETE") { clearInterval(elapsedRef.current ?? undefined); elapsedRef.current = null; }
  }, [interviewState]);

  useEffect(() => {
    if (interviewState === "COMPLETE") setTimeout(() => router.push(`/results/${sessionId}`), 2500);
  }, [interviewState, sessionId, router]);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // Mic is only safe when LISTENING — the task queue sets this AFTER audio ends
  const canRecord   = interviewState === "LISTENING";
  const agentActive = isAgentSpeaking || isPlaying;
  const isWaiting   = isProcessing || agentActive;

  const DIFF_COLOR: Record<string, string> = {
    easy:   "text-emerald-600 bg-emerald-50 border-emerald-200",
    medium: "text-amber-600 bg-amber-50 border-amber-200",
    hard:   "text-red-600 bg-red-50 border-red-200",
  };

  return (
    <div className="min-h-screen bg-[#edf0f7] flex flex-col">

      {/* ── Top header ───────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#1a2744] flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-[#1a2744]">TechMind AI</span>
            <span className="text-gray-300">/</span>
            <span className="text-xs text-gray-400">Interview Session</span>
          </div>

          <div className="flex items-center gap-4">
            {interviewState !== "IDLE" && interviewState !== "COMPLETE" && (
              <span className="text-xs font-mono text-gray-400 tabular-nums">{fmt(elapsed)}</span>
            )}
            {wsStatus !== "open" && (
              <span className="text-xs text-amber-600 font-medium">
                {wsStatus === "connecting" ? "Connecting" : "Reconnecting"}
              </span>
            )}
            {currentQuestion && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{currentQuestion.question_num} / {currentQuestion.total_questions}</span>
                <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#10b981] transition-all duration-700"
                    style={{ width: `${(currentQuestion.question_num / currentQuestion.total_questions) * 100}%` }}
                  />
                </div>
              </div>
            )}
            {/* Status pill */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 border border-gray-200">
              <span className={`w-1.5 h-1.5 rounded-full ${agentActive ? "bg-[#10b981] animate-pulse" : interviewState === "LISTENING" ? "bg-[#10b981]" : interviewState === "PROCESSING" || interviewState === "EVALUATING" ? "bg-amber-400 animate-pulse" : "bg-gray-400"}`} />
              <span className="text-[11px] font-medium text-gray-600">
                {agentActive ? "Agent speaking" : interviewState === "LISTENING" ? "Listening" : interviewState === "PROCESSING" ? "Processing" : interviewState === "EVALUATING" ? "Evaluating" : interviewState === "QUESTION" ? "Question" : interviewState === "TEACHING" ? "Teaching" : interviewState === "IDLE" ? "Ready" : interviewState === "COMPLETE" ? "Complete" : interviewState}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-4 p-4 max-w-7xl mx-auto w-full">

        {/* Dark nav sidebar */}
        <aside className="w-14 bg-[#1a2744] rounded-2xl flex flex-col items-center py-5 gap-5 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div className="flex flex-col gap-3 mt-2">
            {NAV_ICONS.map((icon) => (
              <div key={icon.label} title={icon.label}
                className="w-9 h-9 rounded-xl bg-white/6 hover:bg-white/12 flex items-center justify-center cursor-default transition-colors">
                <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={icon.path} />
                </svg>
              </div>
            ))}
          </div>
          <div className="mt-auto">
            {interviewState !== "IDLE" && (
              <div className="w-9 h-9 rounded-xl bg-white/6 flex items-center justify-center">
                <span className="text-[9px] font-mono text-white/40 tabular-nums">{fmt(elapsed)}</span>
              </div>
            )}
          </div>
        </aside>

        {/* Center: main content */}
        <div className="flex-1 space-y-4 min-w-0">

          {/* IDLE: instructions */}
          {interviewState === "IDLE" && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
              <div>
                <h2 className="text-base font-bold text-[#1a2744]">Before you begin</h2>
                <p className="text-xs text-gray-400 mt-1">
                  Read through the process so the flow is clear during the interview.
                </p>
              </div>
              <ol className="space-y-2">
                {STEPS.map((s) => (
                  <li key={s.n} className="flex gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="text-[10px] font-mono text-gray-400 mt-0.5 flex-shrink-0 w-5">{s.n}</span>
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{s.title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-700">
                Evaluated across 6 dimensions: Accuracy, Communication, Completeness, Confidence, Structure, and use of Examples.
              </div>
              <button
                onClick={startInterview}
                disabled={wsStatus !== "open"}
                className="w-full py-3 rounded-xl bg-[#1a2744] text-white text-sm font-bold hover:bg-[#1e3056] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {wsStatus !== "open" ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 12 0 12 12h-4z" />
                    </svg>
                    Connecting
                  </>
                ) : "Start Interview"}
              </button>
            </div>
          )}

          {/* Question card */}
          {currentQuestion && interviewState !== "IDLE" && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-gray-400 font-medium">
                      Q{currentQuestion.question_num} of {currentQuestion.total_questions}
                    </span>
                    <span className="text-[10px] text-gray-500 px-2 py-0.5 rounded-full bg-gray-100 border border-gray-200">
                      {currentQuestion.category}
                    </span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${DIFF_COLOR[currentQuestion.difficulty] ?? "text-gray-500 bg-gray-50 border-gray-200"}`}>
                      {currentQuestion.difficulty}
                    </span>
                  </div>
                  <p className="text-base font-semibold text-[#1a2744] leading-relaxed">
                    {currentQuestion.question_text}
                  </p>
                </div>
                {/* Score hidden during interview — shown in final report only */}
              </div>

              {/* Follow-up */}
              {followUpText && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider mb-1">Follow-up</p>
                  <p className="text-sm text-amber-900">{followUpText}</p>
                </div>
              )}

              {/* Score card intentionally hidden during the interview.
                  Full evaluation breakdown is in the end-of-interview report. */}
            </div>
          )}

          {/* Teaching card intentionally hidden during interview.
              Concept review is included in the final analytics report. */}

          {/* Voice controls */}
          {interviewState !== "IDLE" && interviewState !== "COMPLETE" && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {isRecording ? "Recording" : agentActive ? "Agent speaking" : "Voice"}
                </span>
                <div className="flex items-center gap-3">
                  {readyForAnswer && countdown !== null && !isRecording && (
                    <span className="text-xs text-amber-600 font-semibold tabular-nums">
                      Auto-skip in {countdown}s
                    </span>
                  )}
                  {isRecording && (
                    <span className="text-xs font-mono text-red-500 tabular-nums">{fmt(duration)}</span>
                  )}
                </div>
              </div>

              {/* Waveform */}
              <div className="rounded-xl bg-gray-50 border border-gray-100 overflow-hidden">
                <AudioWaveform
                  audioLevel={isRecording ? audioLevel : agentActive ? 120 : 0}
                  isActive={isRecording || agentActive}
                  isAgent={agentActive && !isRecording}
                />
              </div>

              {/* Control buttons */}
              <div className="flex gap-2">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    disabled={!canRecord || isWaiting}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                      canRecord && !isWaiting
                        ? "bg-[#10b981] text-white hover:bg-[#0ea572]"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {isWaiting ? (
                      agentActive ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
                          Agent is speaking…
                        </>
                      ) : (
                        <>
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 12 0 12 12h-4z" />
                          </svg>
                          Processing
                        </>
                      )
                    ) : canRecord ? (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Start Speaking
                      </>
                    ) : "Waiting for question"}
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                    </svg>
                    Done Speaking
                  </button>
                )}

                {/* Skip is available both during agent speech (to cut audio) and
                    during LISTENING (to skip the question entirely).
                    Hidden only when the user is actively recording. */}
                {!isRecording && currentQuestion && (
                  <button
                    onClick={skipQuestion}
                    className="px-4 py-3 rounded-xl border border-gray-200 text-xs text-gray-400 font-medium hover:border-gray-300 hover:text-gray-600 transition-colors flex items-center gap-1.5"
                    title="Skip this question"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                    Skip
                  </button>
                )}
              </div>

              {userTranscript && !isRecording && (
                <p className="text-xs text-gray-400 truncate">
                  Transcribed: &ldquo;{userTranscript}&rdquo;
                </p>
              )}

              {interviewState === "LISTENING" && agentActive && (
                <p className="text-xs text-gray-400 text-center">
                  The AI is speaking — please wait before responding.
                </p>
              )}
              {interviewState === "LISTENING" && readyForAnswer && !isRecording && !agentActive && (
                <p className="text-xs text-gray-400 text-center">
                  Press <strong className="text-gray-600">Start Speaking</strong> to answer,
                  or <strong className="text-gray-600">Skip</strong> to continue.
                </p>
              )}
            </div>
          )}

          {/* Complete */}
          {interviewState === "COMPLETE" && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-[#10b981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-base font-bold text-[#1a2744]">Interview complete</p>
              <p className="text-sm text-gray-400">Generating your report — redirecting in a moment</p>
              <div className="flex justify-center">
                <svg className="animate-spin w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 12 0 12 12h-4z" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: transcript ─────────────────────────────────────────── */}
        <aside className="w-72 flex-shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col">
          <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Live Transcript</h3>
            {transcript.length > 0 && (
              <span className="text-[10px] text-gray-400">{transcript.length} messages</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 max-h-[calc(100vh-120px)]">
            {transcript.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-gray-300">
                Transcript appears once the interview starts.
              </div>
            ) : (
              transcript.map((entry, i) => (
                <div key={i} className={`flex gap-2 ${entry.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5 ${
                    entry.role === "agent" ? "bg-[#1a2744] text-white" : "bg-[#10b981] text-white"
                  }`}>
                    {entry.role === "agent" ? "AI" : "U"}
                  </div>
                  <div className="max-w-[85%] space-y-1">
                    <div className={`rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                      entry.role === "agent"
                        ? "bg-gray-100 text-gray-700 rounded-tl-none"
                        : "bg-[#1a2744] text-white rounded-tr-none"
                    }`}>
                      {entry.text}
                    </div>
                    <div className="px-1 flex items-center gap-2">
                      <span className="text-[9px] text-gray-400">
                        {entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {entry.evaluation && (
                        <span className="text-[9px] font-semibold text-[#10b981]">
                          {entry.evaluation.score.toFixed(1)}/10
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
