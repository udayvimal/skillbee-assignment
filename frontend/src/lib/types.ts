// ─── Session ────────────────────────────────────────────────────────────────

export type Role       = "frontend" | "backend" | "fullstack" | "data_engineer" | "devops" | "general";
export type Difficulty = "easy" | "medium" | "hard";
export type Language   = "en" | "hi" | "de";

export type InterviewState =
  | "IDLE"
  | "INTRO"
  | "QUESTION"
  | "LISTENING"
  | "PROCESSING"
  | "EVALUATING"
  | "FOLLOW_UP"
  | "TEACHING"
  | "SUMMARY"
  | "COMPLETE";

export interface CreateSessionPayload {
  candidate_name: string;
  role: Role;
  language: Language;
  difficulty: Difficulty;
  question_count: number;
  categories?: string[];
}

export interface SessionMeta {
  id: string;
  candidate_name: string;
  role: string;
  language: string;
  difficulty: string;
  state: InterviewState;
  current_question_index: number;
  total_questions: number;
  created_at: string;
}

// ─── WebSocket Events ────────────────────────────────────────────────────────

export interface WSEvent {
  type: string;
  data: Record<string, unknown>;
}

export interface ConnectedEvent {
  session_id: string;
  state: InterviewState;
  current_question_index: number;
  total_questions: number;
}

export interface IntroEvent {
  text: string;
  audio: string | null;
  candidate_name: string;
  total_questions: number;
  role: string;
  language: string;
}

export interface QuestionEvent {
  question_id: string;
  question_text: string;
  category: string;
  difficulty: string;
  question_num: number;
  total_questions: number;
  audio: string | null;
}

export interface EvaluationEvent {
  question_id: string;
  score: number;
  // 6 assignment-required sub-scores
  accuracy: number;
  communication: number;
  completeness: number;
  confidence: number;
  structure: number;
  examples_used: number;
  feedback: string;
  strengths: string[];
  weaknesses: string[];
  ideal_answer_summary?: string;
  is_follow_up?: boolean;
  audio: string | null;
}

export interface FollowUpEvent {
  question_id: string;
  text: string;
  audio: string | null;
}

export interface TeachingEvent {
  question_id: string;
  text: string;
  ideal_answer: string;
  key_points: string[];
  audio: string | null;
}

export interface TranscriptEvent {
  text: string;
  is_final: boolean;
}

export interface TransitionEvent {
  text: string;
  audio: string | null;
  next_question_num: number;
}

// ─── Evaluation & Results ────────────────────────────────────────────────────

export interface EvaluationResult {
  question_id: string;
  question_text: string;
  answer_text: string;
  category: string;
  // 6 sub-scores (assignment requirement)
  accuracy: number;
  communication: number;
  completeness: number;
  confidence: number;
  structure: number;
  examples_used: number;
  score: number;
  feedback: string;
  strengths: string[];
  weaknesses: string[];
  reference_snippet: string;
  ideal_answer: string;
  ideal_answer_summary: string;
  is_follow_up: boolean;
}

export interface CategoryScore {
  category: string;
  score: number;
  question_count: number;
}

export interface SummaryData {
  session_id: string;
  candidate_name: string;
  role: string;
  overall_score: number;
  grade: string;
  category_scores: CategoryScore[];
  evaluations: EvaluationResult[];
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  interview_duration_minutes: number;
  completed_at: string;
  overall_impression?: string;
  hiring_signal?: "strong_yes" | "yes" | "maybe" | "no";
  summary_speech?: string;
  audio?: string | null;
}

// ─── Transcript ──────────────────────────────────────────────────────────────

export interface TranscriptEntry {
  role: "agent" | "user";
  text: string;
  timestamp: Date;
  evaluation?: Pick<EvaluationEvent, "score" | "feedback">;
  teaching?: { ideal_answer: string; key_points: string[] };
}
