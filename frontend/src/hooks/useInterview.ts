"use client";

import { useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import type {
  ConnectedEvent,
  EvaluationEvent,
  FollowUpEvent,
  IntroEvent,
  QuestionEvent,
  SummaryData,
  TeachingEvent,
  TranscriptEvent,
  TransitionEvent,
  WSEvent,
} from "@/lib/types";
import { useInterviewStore } from "@/store/interviewStore";
import { useAudioPlayer } from "./useAudioPlayer";
import { useAudioRecorder } from "./useAudioRecorder";
import { useWebSocket } from "./useWebSocket";

const log = (event: string, detail?: string) =>
  console.log(`[INTERVIEW] ${event}${detail ? " — " + detail : ""}`);

export function useInterview(sessionId: string) {
  // Stable Zustand action refs (Zustand guarantees these never change)
  const setInterviewState   = useInterviewStore((s) => s.setInterviewState);
  const setCurrentQuestion  = useInterviewStore((s) => s.setCurrentQuestion);
  const addTranscriptEntry  = useInterviewStore((s) => s.addTranscriptEntry);
  const addEvaluation       = useInterviewStore((s) => s.addEvaluation);
  const clearEvaluations    = useInterviewStore((s) => s.clearEvaluations);
  const setTeachingData     = useInterviewStore((s) => s.setTeachingData);
  const setSummary          = useInterviewStore((s) => s.setSummary);
  const setIsAgentSpeaking  = useInterviewStore((s) => s.setIsAgentSpeaking);
  const setIsProcessing     = useInterviewStore((s) => s.setIsProcessing);
  const setUserTranscript   = useInterviewStore((s) => s.setUserTranscript);
  const setFollowUpText     = useInterviewStore((s) => s.setFollowUpText);
  const setIsFollowUpActive = useInterviewStore((s) => s.setIsFollowUpActive);
  const setIsRecording      = useInterviewStore((s) => s.setIsRecording);

  const player   = useAudioPlayer();
  const recorder = useAudioRecorder();

  // ── Deterministic task queue ───────────────────────────────────────────────
  // All WS events that carry audio are pushed here as async functions.
  // runQueue processes them one-at-a-time: each task awaits its audio before
  // the next task starts.  This is the single fix that resolves Bugs 1–6.
  const taskQueueRef  = useRef<Array<() => Promise<void>>>([]);
  const taskBusyRef   = useRef(false);
  const mountedRef    = useRef(true);

  const runQueue = useCallback(async () => {
    if (taskBusyRef.current) return;
    taskBusyRef.current = true;
    try {
      while (taskQueueRef.current.length > 0 && mountedRef.current) {
        const task = taskQueueRef.current.shift()!;
        await task();
      }
    } finally {
      taskBusyRef.current = false;
    }
  }, []); // no deps — only reads refs

  const enqueue = useCallback(
    (fn: () => Promise<void>) => {
      taskQueueRef.current.push(fn);
      runQueue().catch(console.error);
    },
    [runQueue]
  );

  // Track follow-up mode and double-submission guard
  const isFollowUpRef       = useRef(false);
  const answerSubmittedRef  = useRef(false);

  // Cleanup on unmount: abort queue, stop audio
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      taskQueueRef.current = [];
      player.stop();
    };
  }, [player.stop]); // player.stop is stable (useCallback)

  // ── WebSocket message handler ──────────────────────────────────────────────
  const handleMessage = useCallback(
    (event: WSEvent) => {
      const { type, data } = event;

      switch (type) {

        // ── Informational — applied immediately, no audio ──────────────────

        case "connected": {
          const d = data as unknown as ConnectedEvent;
          setInterviewState(d.state);
          break;
        }

        case "state_change": {
          const s = (data as { state: string }).state;
          // PROCESSING / EVALUATING are spinner states — show immediately.
          // All other transitions (INTRO, QUESTION, LISTENING, FOLLOW_UP,
          // TEACHING, COMPLETE) are driven by the task queue below so that
          // state never advances until the preceding audio has finished.
          if (s === "PROCESSING" || s === "EVALUATING") {
            setInterviewState(s as never);
            setIsProcessing(true);
            log("STATE", s);
          }
          break;
        }

        case "transcript": {
          const d = data as unknown as TranscriptEvent;
          if (d.is_final) {
            setUserTranscript(d.text);
            addTranscriptEntry({ role: "user", text: d.text, timestamp: new Date() });
          }
          break;
        }

        case "error":
          console.warn("[WS] server error:", (data as { message: string }).message);
          break;

        // ── Audio-carrying events — serialised through the task queue ──────

        case "intro": {
          const d = data as unknown as IntroEvent;
          enqueue(async () => {
            if (!mountedRef.current) return;
            log("INTRO_STARTED");
            setInterviewState("INTRO" as never);
            addTranscriptEntry({ role: "agent", text: d.text, timestamp: new Date() });
            setIsAgentSpeaking(true);
            await player.playAsync(d.audio, d.text);
            if (!mountedRef.current || player.wasStopped()) return;
            setIsAgentSpeaking(false);
            log("INTRO_DONE");
          });
          break;
        }

        case "question": {
          const d = data as unknown as QuestionEvent;
          enqueue(async () => {
            if (!mountedRef.current) return;
            log(`QUESTION_${d.question_num}_STARTED`);

            clearEvaluations();
            setCurrentQuestion(d);
            setFollowUpText(null);
            setIsFollowUpActive(false);
            setTeachingData(null);
            setIsProcessing(false);
            isFollowUpRef.current = false;
            answerSubmittedRef.current = false;

            addTranscriptEntry({
              role: "agent",
              text: `[Q${d.question_num}/${d.total_questions} · ${d.category}] ${d.question_text}`,
              timestamp: new Date(),
            });

            setInterviewState("QUESTION" as never);
            setIsAgentSpeaking(true);

            await player.playAsync(d.audio, d.question_text);

            // If stop() was called (user skipped or component unmounted) do NOT
            // set LISTENING — the skip handler owns the next state transition.
            if (!mountedRef.current || player.wasStopped()) return;

            log(`QUESTION_${d.question_num}_AUDIO_DONE`);
            setIsAgentSpeaking(false);
            // Tell the backend the audio finished — it will now set LISTENING
            // and start accepting audio submissions. This is the synchronization
            // point that prevents premature answer acceptance during audio playback.
            send({ type: "ready_to_listen" });
            setInterviewState("LISTENING" as never);
            log("MIC_ENABLED");
          });
          break;
        }

        case "evaluation": {
          const d = data as unknown as EvaluationEvent;
          enqueue(async () => {
            if (!mountedRef.current) return;
            log("EVALUATION_STARTED", `score=${d.score}`);
            addEvaluation(d);
            addTranscriptEntry({
              role: "agent",
              text: d.feedback,
              timestamp: new Date(),
              evaluation: { score: d.score, feedback: d.feedback },
            });
            setIsProcessing(false);
            // score < 5 → teaching follows; skip eval audio to avoid double correction
            if (d.score >= 5) {
              setIsAgentSpeaking(true);
              await player.playAsync(d.audio, d.feedback);
              if (!mountedRef.current || player.wasStopped()) return;
              setIsAgentSpeaking(false);
            }
            log("EVALUATION_DONE");
          });
          break;
        }

        case "follow_up": {
          const d = data as unknown as FollowUpEvent;
          enqueue(async () => {
            if (!mountedRef.current) return;
            log("FOLLOW_UP_STARTED");
            setFollowUpText(d.text);
            setIsFollowUpActive(true);
            isFollowUpRef.current = true;
            answerSubmittedRef.current = false;
            addTranscriptEntry({
              role: "agent",
              text: `[Follow-up] ${d.text}`,
              timestamp: new Date(),
            });
            setInterviewState("FOLLOW_UP" as never);
            setIsAgentSpeaking(true);
            await player.playAsync(d.audio, d.text);
            if (!mountedRef.current || player.wasStopped()) return;
            setIsAgentSpeaking(false);
            send({ type: "ready_to_listen" });
            setInterviewState("LISTENING" as never);
            log("MIC_ENABLED (follow-up)");
          });
          break;
        }

        case "teaching": {
          const d = data as unknown as TeachingEvent;
          enqueue(async () => {
            if (!mountedRef.current) return;
            log("TEACHING_STARTED");
            setTeachingData(d);
            addTranscriptEntry({
              role: "agent",
              text: d.text,
              timestamp: new Date(),
            });
            setInterviewState("TEACHING" as never);
            setIsAgentSpeaking(true);
            await player.playAsync(d.audio, d.text);
            if (!mountedRef.current || player.wasStopped()) return;
            setIsAgentSpeaking(false);
            log("TEACHING_DONE");
          });
          break;
        }

        case "transition": {
          const d = data as unknown as TransitionEvent;
          enqueue(async () => {
            if (!mountedRef.current) return;
            log("TRANSITION_STARTED");
            setIsAgentSpeaking(true);
            await player.playAsync(d.audio, d.text);
            if (!mountedRef.current || player.wasStopped()) return;
            setIsAgentSpeaking(false);
            log("TRANSITION_DONE");
          });
          break;
        }

        case "summary": {
          const d = data as unknown as SummaryData;
          enqueue(async () => {
            if (!mountedRef.current) return;
            log("SUMMARY_ARRIVED");
            setSummary(d);
            // Play conclusion audio IN FULL before setting COMPLETE.
            // Setting COMPLETE first triggers the redirect timer (2.5s in InterviewRoom)
            // which unmounts the component and cuts off the audio mid-sentence.
            if (d.audio) {
              setIsAgentSpeaking(true);
              await player.playAsync(d.audio, "Thank you for completing the interview.");
              if (!mountedRef.current) return;
              setIsAgentSpeaking(false);
            }
            // Now safe to set COMPLETE — redirect fires 2.5s from here
            setInterviewState("COMPLETE" as never);
            log("INTERVIEW_COMPLETE");
          });
          break;
        }
      }
    },
    // All deps are stable (Zustand actions, enqueue, player methods)
    [
      enqueue, send, player.playAsync, player.wasStopped,
      setInterviewState, setCurrentQuestion, addTranscriptEntry, addEvaluation,
      clearEvaluations, setTeachingData, setSummary, setIsAgentSpeaking, setIsProcessing,
      setUserTranscript, setFollowUpText, setIsFollowUpActive,
    ]
  );

  const { status, send } = useWebSocket({ sessionId, onMessage: handleMessage });

  // ── Public actions ─────────────────────────────────────────────────────────

  const startInterview = useCallback(() => {
    log("START_REQUESTED");
    send({ type: "start" });
  }, [send]);

  const skipQuestion = useCallback(() => {
    log("SKIP_REQUESTED");
    // Drain any pending audio tasks so the skip takes effect immediately
    taskQueueRef.current = [];
    player.stop();
    send({ type: "skip" });
  }, [send, player.stop]);

  const startRecording = useCallback(async () => {
    // Stop any in-progress agent audio when the user explicitly starts speaking
    taskQueueRef.current = [];
    player.stop();
    answerSubmittedRef.current = false;
    setUserTranscript("");
    log("RECORDING_STARTED");
    await recorder.startRecording();
    setIsRecording(true);
  }, [player.stop, recorder, setUserTranscript, setIsRecording]);

  const stopRecording = useCallback(async () => {
    if (answerSubmittedRef.current) return; // guard against double-submit
    setIsRecording(false);
    log("RECORDING_STOPPED");

    const blob = await recorder.stopRecording();
    if (!blob || blob.size === 0) return;

    answerSubmittedRef.current = true;
    setIsProcessing(true);
    try {
      const { transcript } = await api.submitAudio(sessionId, blob, isFollowUpRef.current);
      setUserTranscript(transcript);
      log("ANSWER_SUBMITTED", `isFollowUp=${isFollowUpRef.current}`);
      send({ type: "answer_ready" });
    } catch (err) {
      console.error("[Interview] audio submit failed:", err);
      answerSubmittedRef.current = false;
      setIsProcessing(false);
    }
  }, [recorder, sessionId, send, setIsRecording, setIsProcessing, setUserTranscript]);

  return {
    wsStatus: status,
    isPlaying: player.isPlaying,
    audioLevel: recorder.audioLevel,
    isRecording: recorder.isRecording,
    duration: recorder.duration,
    startInterview,
    skipQuestion,
    startRecording,
    stopRecording,
  };
}
