import type {
  CategoryScore,
  CreateSessionPayload,
  EvaluationResult,
  SessionMeta,
  SummaryData,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  createSession: (payload: CreateSessionPayload) =>
    request<SessionMeta>("/api/v1/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getSession: (id: string) =>
    request<SessionMeta>(`/api/v1/sessions/${id}`),

  getResults: (id: string) =>
    request<SummaryData>(`/api/v1/sessions/${id}/results`),

  getStatus: (id: string) =>
    request<{ state: string; current_question_index: number; total_questions: number; connected: boolean }>(
      `/api/v1/interview/${id}/status`
    ),

  submitAudio: async (sessionId: string, audioBlob: Blob, isFollowUp: boolean): Promise<{ transcript: string }> => {
    const form = new FormData();
    form.append("audio", audioBlob, "audio.webm");
    form.append("is_follow_up", String(isFollowUp));
    const res = await fetch(`${API_URL}/api/v1/interview/${sessionId}/submit-audio`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
  },
};
