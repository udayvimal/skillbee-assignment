import { create } from "zustand";
import type {
  EvaluationEvent,
  InterviewState,
  QuestionEvent,
  SessionMeta,
  SummaryData,
  TeachingEvent,
  TranscriptEntry,
} from "@/lib/types";

interface InterviewStore {
  // Session
  session: SessionMeta | null;
  setSession: (s: SessionMeta) => void;

  // Live state
  interviewState: InterviewState;
  setInterviewState: (s: InterviewState) => void;

  // Current question
  currentQuestion: QuestionEvent | null;
  setCurrentQuestion: (q: QuestionEvent | null) => void;

  // Transcript
  transcript: TranscriptEntry[];
  addTranscriptEntry: (entry: TranscriptEntry) => void;

  // Evaluations
  evaluations: EvaluationEvent[];
  addEvaluation: (e: EvaluationEvent) => void;
  clearEvaluations: () => void;

  // Teaching moment (score < 5)
  teachingData: TeachingEvent | null;
  setTeachingData: (t: TeachingEvent | null) => void;

  // Summary
  summary: SummaryData | null;
  setSummary: (s: SummaryData) => void;

  // UI state
  isRecording: boolean;
  setIsRecording: (v: boolean) => void;
  isAgentSpeaking: boolean;
  setIsAgentSpeaking: (v: boolean) => void;
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
  userTranscript: string;
  setUserTranscript: (t: string) => void;
  followUpText: string | null;
  setFollowUpText: (t: string | null) => void;
  isFollowUpActive: boolean;
  setIsFollowUpActive: (v: boolean) => void;

  // Reset
  reset: () => void;
}

const initial = {
  session:          null,
  interviewState:   "IDLE" as InterviewState,
  currentQuestion:  null,
  transcript:       [] as TranscriptEntry[],
  evaluations:      [] as EvaluationEvent[],
  teachingData:     null,
  summary:          null,
  isRecording:      false,
  isAgentSpeaking:  false,
  isProcessing:     false,
  userTranscript:   "",
  followUpText:     null,
  isFollowUpActive: false,
};

export const useInterviewStore = create<InterviewStore>((set) => ({
  ...initial,

  setSession:           (session)          => set({ session }),
  setInterviewState:    (interviewState)   => set({ interviewState }),
  setCurrentQuestion:   (currentQuestion)  => set({ currentQuestion }),
  addTranscriptEntry:   (entry)            => set((s) => ({ transcript: [...s.transcript, entry] })),
  addEvaluation:        (e)                => set((s) => ({ evaluations: [...s.evaluations, e] })),
  clearEvaluations:     ()                 => set({ evaluations: [] }),
  setTeachingData:      (teachingData)     => set({ teachingData }),
  setSummary:           (summary)          => set({ summary }),
  setIsRecording:       (isRecording)      => set({ isRecording }),
  setIsAgentSpeaking:   (isAgentSpeaking)  => set({ isAgentSpeaking }),
  setIsProcessing:      (isProcessing)     => set({ isProcessing }),
  setUserTranscript:    (userTranscript)   => set({ userTranscript }),
  setFollowUpText:      (followUpText)     => set({ followUpText }),
  setIsFollowUpActive:  (isFollowUpActive) => set({ isFollowUpActive }),

  reset: () => set(initial),
}));
