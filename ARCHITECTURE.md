# TechMind AI — System Architecture

**Production-Grade Voice Interview Platform**
*Audio I/O · RAG Grounding · LLM Routing · Real-time WebSocket · Structured Reporting*

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Architecture](#2-component-architecture)
3. [Request Flow — Interview Pipeline](#3-request-flow--interview-pipeline)
4. [Audio Synchronisation Architecture](#4-audio-synchronisation-architecture)
5. [Retrieval-Augmented Evaluation](#5-retrieval-augmented-evaluation)
6. [State Machine — Interview Session](#6-state-machine--interview-session)
7. [WebSocket Event Bus](#7-websocket-event-bus)
8. [Database Schema](#8-database-schema)
9. [Latency Budget](#9-latency-budget)
10. [Security Model](#10-security-model)
11. [Scaling Considerations](#11-scaling-considerations)
12. [Key Design Decisions](#12-key-design-decisions)

---

## 1. System Overview

```
+-----------------------------------------------------------------------------+
|                           TechMind AI Platform                              |
|                                                                             |
|  +---------------------------+          +----------------------------------+ |
|  |       FRONTEND            |          |           BACKEND                | |
|  |    (Next.js 15 / Vercel)  |          |       (FastAPI / Render)         | |
|  |                           |          |                                  | |
|  |  +-----------------+      |   REST   |  +-----------------------------+ | |
|  |  |  Landing Page   |------+----------+->|  POST /api/v1/sessions      | | |
|  |  |  (config form)  |      |          |  +-----------------------------+ | |
|  |  +-----------------+      |          |                                  | |
|  |                           |          |  +-----------------------------+ | |
|  |  +-----------------+      |WebSocket |  |  WS /ws/{session_id}        | | |
|  |  |  Interview Room |<-----+----------+->|  Real-time event bus        | | |
|  |  |  (live UI)      |      |          |  +-----------------------------+ | |
|  |  +-----------------+      |          |                                  | |
|  |        |                  |  REST    |  +-----------------------------+ | |
|  |        | audio blob       |----------+->|  POST /interview/{id}/audio | | |
|  |        v                  |          |  +-----------------------------+ | |
|  |  +-----------------+      |          |                                  | |
|  |  |  Results Page   |<-----+----------+->|  GET /sessions/{id}/results  | | |
|  |  |  (analytics)    |      |          |  +-----------------------------+ | |
|  |  +-----------------+      |          |                                  | |
|  +---------------------------+          +----------------------------------+ |
|                                                                             |
|              External Services                                              |
|  +------------------+  +------------------+  +---------------------------+ |
|  |  Groq Inference  |  |  Microsoft Edge  |  |  fastembed (local ONNX)   | |
|  |  --------------  |  |  TTS (local)     |  |  + FAISS (local CPU)      | |
|  |  Whisper STT     |  |  --------------  |  |  -----------------------  | |
|  |  LLaMA 3.3 70B   |  |  MP3 synthesis   |  |  BAAI/bge-small-en-v1.5   | |
|  |  LLaMA 3.1 8B    |  |  EN / HI / DE    |  |  384-dim vectors          | |
|  +------------------+  +------------------+  +---------------------------+ |
+-----------------------------------------------------------------------------+
```

---

## 2. Component Architecture

### 2.1 Backend — Service Layer

```
backend/
├── main.py                 FastAPI app, CORS, health endpoint
├── config.py               Pydantic BaseSettings (env vars, typed)
├── database.py             Async SQLAlchemy + SQLite (WAL mode)
|
├── models/
|   └── session.py          Session ORM model; InterviewState enum
|
├── data/
|   ├── qa_dataset.json     31 curated Q&A pairs (source of truth)
|   ├── faiss.index         Built at startup, persisted to disk
|   └── embeddings_cache.npz  Vectorised Q&A pairs (pre-computed)
|
├── prompts/
|   ├── evaluation_prompt.md  Rubric (6 axes -> JSON output)
|   ├── followup_prompt.md    Follow-up question targeting weakness
|   ├── teaching_prompt.md    2-sentence correction (<80 tokens)
|   └── feedback_prompt.md    End-of-session summary generator
|
├── services/
|   ├── retrieval_service.py  FAISS build/search; fastembed encode
|   ├── stt_service.py        Groq Whisper; audio file -> transcript
|   ├── tts_service.py        edge-tts synthesis; text -> base64 MP3
|   ├── llm_service.py        Groq API wrapper; retry; model routing
|   ├── evaluation_service.py evaluate_answer · follow_up · teaching
|   ├── interview_engine.py   InterviewSession state machine
|   └── prompt_loader.py      @lru_cache .md file loader
|
└── api/routes/
    ├── sessions.py           CRUD for sessions; results aggregation
    ├── interview.py          Audio upload -> Whisper -> ack -> WS fire
    └── websocket.py          WS handler; poll loop; event emitter
```

### 2.2 Frontend — Hook and Component Layer

```
frontend/src/
├── app/
|   ├── page.tsx                    Interview configuration form
|   ├── interview/page.tsx          Route container (session loader)
|   └── results/[id]/page.tsx      Results route (fetches /results)
|
├── components/
|   ├── interview/
|   |   ├── InterviewRoom.tsx       Core interview UI (state-driven)
|   |   └── AudioWaveform.tsx       AnalyserNode canvas renderer
|   └── analytics/
|       ├── AnalyticsDashboard.tsx  Score cards, radar, breakdown
|       └── PDFExport.tsx           jspdf + html2canvas PDF builder
|
├── hooks/
|   ├── useInterview.ts     * Central coordinator; Promise task queue
|   ├── useAudioPlayer.ts   * FIFO audio queue; playAsync() primitive
|   ├── useAudioRecorder.ts   MediaRecorder; AnalyserNode waveform
|   └── useWebSocket.ts       WS client; exponential backoff reconnect
|
├── store/
|   └── interviewStore.ts   Zustand; clearEvaluations action; stable selectors
|
└── lib/
    ├── types.ts            All TypeScript interfaces (WSEvent union, etc.)
    └── api.ts              Typed REST client (createSession, submitAudio)
```

---

## 3. Request Flow — Interview Pipeline

```
PHASE 1: Session Setup
-----------------------------------------------------------------------

Browser                         Backend                        Database
  |                               |                               |
  |-- POST /api/v1/sessions ----->|                               |
  |   {name, role, difficulty,    |-- INSERT sessions ----------->|
  |    language, question_count}  |                               |
  |                               |<- session_id ----------------|
  |<- {id, status:"pending"} ----|                               |


PHASE 2: Live Interview (via WebSocket)
-----------------------------------------------------------------------

Browser                         Backend                        Groq / TTS
  |                               |                               |
  |== WS /ws/{session_id} =======>|                               |
  |<== {connected, state:IDLE} ===|                               |
  |                               |                               |
  |---- {type:"start"} ---------->|                               |
  |                               |                               |
  |                               |-- edge-tts(intro text) ------>|
  |                               |<- MP3 bytes ------------------|
  |<== {intro, audio:base64} ===  |                               |
  |  [Browser plays MP3]          |                               |
  |                               |-- edge-tts(Q1 text) --------->|
  |                               |<- MP3 bytes ------------------|
  |<== {question, audio:base64} ==|                               |
  |  [Browser plays MP3 - then]   |                               |
  |  [mic activates automatically]|                               |


PHASE 3: Answer Submission
-----------------------------------------------------------------------

Browser                         Backend               Groq              FAISS
  |                               |                     |                 |
  |-- POST /interview/{id}/audio ->|                     |                 |
  |   [WebM/WAV blob]             |-- Whisper STT ------>|                 |
  |                               |<- transcript --------|                 |
  |<- {transcript, duration_ms} --|                     |                 |
  |-- {type:"answer_ready"} ----->|                     |                 |
  |                               |                     |                 |
  |                               |-- embed(answer) ---------------------->|
  |                               |<- reference_answer + context ---------|
  |                               |                     |                 |
  |                               |-- LLaMA 3.3 70B ---->|                 |
  |                               |   [evaluation prompt |                 |
  |                               |    + reference answer|                 |
  |                               |    + candidate answer|                 |
  |                               |    -> JSON {6 scores}]|                |
  |                               |<- evaluation JSON ---|                 |
  |                               |                     |                 |
  |                               | SCORE ROUTING:                         |
  |                               |   score >= 8 -> transition + next Q   |
  |                               |   score 5-8  -> follow_up question    |
  |                               |   score < 5  -> 2-sentence teaching   |
  |                               |                     |                 |
  |<== {evaluation, audio} =======|                     |                 |
  |<== {follow_up/teaching/audio} |                     |                 |
  |<== {question_N, audio} =======|                     |                 |
```

---

## 4. Audio Synchronisation Architecture

**The core engineering challenge:** the backend streams 5-8 WebSocket events in < 100ms (intro → question → LISTENING), but audio playback takes 3-15 seconds. Applying events immediately activates the microphone before the question audio ends.

### The Solution: Promise-Based FIFO Task Queue

```
WebSocket Events (arrive in milliseconds)
        |
        v
  +-----------------------------------------------------------------------+
  |  Task Queue:  [intro_task] -- [question_task] -- [eval_task] -- ...  |
  |                                                                       |
  |  runQueue() awaits each task's Promise before calling .shift()        |
  +------------------------------------+----------------------------------+
                                       |  sequential execution
                                       v

  intro_task: {
    setInterviewState("INTRO")
    setIsAgentSpeaking(true)
    await player.playAsync(intro.audio, intro.text)   <- BLOCKS until ended
    setIsAgentSpeaking(false)
  }
                                       |
                                       v
  question_task: {
    clearEvaluations()             <- removes previous Q's score card
    setCurrentQuestion(q)
    setInterviewState("QUESTION")  <- mic OFF
    setIsAgentSpeaking(true)
    await player.playAsync(q.audio, q.question_text)  <- BLOCKS until ended
    setIsAgentSpeaking(false)
    setInterviewState("LISTENING") <- mic ON - only NOW
  }
                                       |
                                       v
  evaluation_task: {
    addEvaluation(eval)
    if (eval.score >= 5) {
      await player.playAsync(eval.audio, eval.feedback)  <- skipped if < 5
    }
    // if score < 5, teaching_task follows and plays instead
  }


AudioPlayer FIFO Queue (useAudioPlayer.ts):
  +------------------------------------------------------------------+
  |  playAsync(b64, fallback): Promise<void>                         |
  |    -> Decodes base64 MP3                                         |
  |    -> new Audio(objectURL)                                       |
  |    -> audio.onended = resolve                                    |
  |    -> Returns Promise that resolves ONLY when audio ends         |
  +------------------------------------------------------------------+
```

### What the Queue Fixes

| Bug (before queue) | Fix (after queue) |
|--------------------|-------------------|
| Mic on while question audio plays | LISTENING state set only after `await playAsync()` resolves |
| Previous Q's score card shows during next Q | `clearEvaluations()` is first call in question task |
| Double correction (eval + teaching both play) | Evaluation audio skipped when `score < 5` |
| Agent speaking indicator stuck ON | `setIsAgentSpeaking(false)` always runs after `await` |
| Skip race condition | Skip drains `taskQueueRef.current = []` + calls `player.stop()` |
| Backend sends LISTENING early | `state_change: LISTENING` from backend is ignored; frontend owns LISTENING |

---

## 5. Retrieval-Augmented Evaluation

Every evaluation is grounded in the canonical reference answer, not LLM memory.

```
INDEXING (startup, ~30s once)
-----------------------------------------------------------------------
  qa_dataset.json (31 Q&As)
        |
        v
  fastembed ONNX (BAAI/bge-small-en-v1.5)
        |
        v  384-dim vectors for all 31 entries
  FAISS IndexFlatIP
  (cosine similarity via L2-normalised inner product)
        |
        v  persisted to:
  faiss.index + embeddings_cache.npz


EVALUATION (per answer, ~5ms retrieval)
-----------------------------------------------------------------------
  1. Direct Lookup
     question_id -> qa_dataset[id] -> reference_answer + key_points

  2. Supplementary Retrieval
     embed(candidate_answer) -> FAISS.search(top_k=2)
     -> Related Q&As for broader evaluation context

  3. Prompt Assembly
     evaluation_prompt.md
     + {question, reference_answer, key_points}   <- grounding facts
     + {candidate_answer}                         <- what to score
     + {related_context}                          <- supplementary

  4. LLM Scoring (LLaMA 3.3 70B)
     -> JSON output: {score, accuracy, communication,
                      completeness, confidence, structure,
                      examples_used, feedback, strengths, weaknesses}
```

### fastembed vs. sentence-transformers

| | fastembed (chosen) | sentence-transformers |
|---|---|---|
| Runtime | ONNX | PyTorch |
| RAM usage | ~80 MB | ~500+ MB |
| Render Free Tier RAM | 512 MB total — fits | Exceeds limit, OOM crash |
| First-load latency | < 2s | 8-15s |
| Model quality | Same BGE-small-en-v1.5 | Same model |

---

## 6. State Machine — Interview Session

```
           +------+
           | IDLE |  <- WS connected, waiting for {type:"start"}
           +--+---+
              |
              v  {type:"start"}
           +-------+
           | INTRO |  Agent speaks introduction
           +--+----+
              |  intro audio ends
              v
         +-----------+
         | QUESTION  |  Agent speaks question; mic DISABLED
         +--+--------+
            |  question audio ends
            v
         +-----------+
   +-----|  LISTENING |  mic ENABLED; countdown starts
   |     +--+---------+
   |        |  user submits audio
   |        v
   |   +------------+
   |   | PROCESSING |  Whisper STT running
   |   +--+---------+
   |      |
   |      v
   |   +------------+
   |   | EVALUATING |  LLM scoring
   |   +--+---------+
   |      |
   |      +--- score >= 8 ------------------------------------------+
   |      |                                                          |
   |      +--- score 5-8 --> +-----------+                          |
   |      |                  | FOLLOW_UP |                          |
   |      |                  +--+--------+                          |
   |      |                     |  follow-up audio ends             |
   |      |                     v                                   |
   +------+--- score < 5 --> +-----------+                          |
                              | TEACHING  |                          |
                              +--+--------+                          |
                                 |  teaching audio ends              |
                                 v                                   |
                            +-----------+                            |
                            | QUESTION  | <--------------------------+
                            |  (next)   |  If questions remain
                            +--+--------+
                               |  all questions done
                               v
                            +----------+
                            | COMPLETE |  Report generated
                            +----------+
```

---

## 7. WebSocket Event Bus

### Duplicate-answer guard

```python
# websocket.py
answer_processing = False  # per-connection flag

while True:
    if getattr(session, "_pending_answer", None) and not answer_processing:
        answer_processing = True
        try:
            await process_answer_and_emit_events(session, ws)
        finally:
            answer_processing = False
        continue
    await asyncio.sleep(0.1)
```

Prevents the race where a reconnecting client sends `answer_ready` twice before the first LLM call completes.

### Audio transport design

```
Option A (rejected): Stream audio blob over WebSocket
  - 2-5 MB blob blocks WS frame queue
  - State events (PROCESSING, EVALUATING) arrive after audio = wrong order

Option B (chosen): REST upload + WS signal
  - Audio blob: POST /interview/{id}/submit-audio (separate HTTP)
  - After upload: browser sends {type:"answer_ready"} over WS
  - WS stays clear for lightweight JSON state events only
  - Result: state events always arrive before corresponding audio
```

### Full Event Reference

```
Client -> Server:
  {type: "start"}          Begin the interview
  {type: "answer_ready"}   Audio submitted; process it
  {type: "skip"}           Skip current question
  {type: "ping"}           25s keepalive

Server -> Client:
  {type: "connected",    data: {state, total_questions}}
  {type: "state_change", data: {state}}
  {type: "intro",        data: {text, audio}}
  {type: "question",     data: {question_num, total_questions, question_text, category, difficulty, audio}}
  {type: "transcript",   data: {text, is_final}}
  {type: "evaluation",   data: {score, feedback, audio, accuracy, communication, ...}}
  {type: "follow_up",    data: {text, audio}}
  {type: "teaching",     data: {text, audio, ideal_answer, key_points}}
  {type: "transition",   data: {text, audio}}
  {type: "summary",      data: {overall_score, grade, ...}}
  {type: "pong"}
  {type: "error",        data: {message}}
```

---

## 8. Database Schema

```sql
-- SQLite with WAL mode for concurrent reads
PRAGMA journal_mode = WAL;

CREATE TABLE sessions (
    id               TEXT PRIMARY KEY,       -- UUID v4
    candidate_name   TEXT NOT NULL,
    role             TEXT NOT NULL,          -- backend|frontend|fullstack|...
    difficulty       TEXT NOT NULL,          -- easy|medium|hard
    language         TEXT NOT NULL DEFAULT 'en',
    question_count   INTEGER NOT NULL DEFAULT 3,
    status           TEXT NOT NULL DEFAULT 'pending',
    evaluations      TEXT,                   -- JSON array of EvaluationEvent
    summary          TEXT,                   -- JSON SummaryData
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Runtime (not persisted after session ends)
    _current_question_id  TEXT,
    _pending_answer       TEXT,              -- transcript pending evaluation
    _question_index       INTEGER DEFAULT 0
);
```

**Why SQLite over PostgreSQL:** Render Free Tier offers no free managed Postgres. SQLite on a 1 GB attached Disk costs nothing and handles the single-writer-per-session concurrency correctly. Swap `sqlite+aiosqlite` → `postgresql+asyncpg` in `DATABASE_URL` to migrate — no code changes.

---

## 9. Latency Budget

**Target: candidate hears agent response within 3s of submitting their answer.**

```
Audio upload (~50 KB WebM)   ----------  100-200ms  (browser -> Render)
Groq Whisper STT             ----------  200-400ms  (GPU inference)
FAISS search (top-2)         ----------  < 5ms      (in-process, 31 vectors)
LLaMA 3.3 70B evaluation     ----------  800-1500ms (Groq dedicated HW)
edge-tts synthesis (EN)      ----------  300-600ms  (local subprocess)
base64 encode + WS send      ----------  20-50ms
Browser decode + play        ----------  50-100ms
-------------------------------------------------------------------
Total (p50)                             1.5 - 2.8s  [Target met]
Total (p95, long answers)               3.5 - 5.0s  [Acceptable]
```

**Cold start (Render Free Tier after sleep):**
- fastembed model download: ~30s (first deploy only)
- FAISS index build: ~5s (31 vectors)
- Total cold: ~35s first time; ~8s after restart (index cached on Disk)

---

## 10. Security Model

| Threat | Mitigation |
|--------|-----------|
| CORS | `CORS_ORIGINS` env var; defaults to `localhost:3000`; production = Vercel domain |
| Session enumeration | UUID v4 (122 bits entropy) |
| Audio injection | Whisper output treated as untrusted user text (never executed) |
| Prompt injection | Candidate answer wrapped in explicit delimiters; rubric from server files |
| LLM output injection | All LLM output through JSON parse or sentence splitter; never raw HTML |
| WebSocket flood | Ping/pong keepalive; connection closed on protocol error |
| API key exposure | `GROQ_API_KEY` in env only; never in source or logs |
| Database access | SQLite on Render Disk; not network-accessible |

---

## 11. Scaling Considerations

**Current design: single-instance, single-user-per-session (appropriate for the assignment scope)**

For a production multi-tenant deployment:

```
Blockers to address:
  1. SQLite -> PostgreSQL (asyncpg connection pool)
  2. FAISS in-process -> Qdrant or Pinecone (shared across pods)
  3. Session _pending_answer in-process -> Redis

Stateless horizontal path (after above):
  +----------+    +----------------+    +------------------+
  | Vercel   |    | Load Balancer  |    | FastAPI Pod 1    |
  | frontend |--->| (sticky WS     |--->| FastAPI Pod 2    |
  |          |    |  sessions)     |--->| FastAPI Pod N    |
  +----------+    +----------------+    +------------------+
                                              |
                               +--------------+-----------+
                               |                          |
                           +-------+               +------------+
                           | Redis |               | PostgreSQL |
                           |(state)|               | (sessions) |
                           +-------+               +------------+

Groq free-tier limits:
  LLaMA 3.3 70B:  6,000 tokens/min  -> supports ~10 concurrent interviews
  LLaMA 3.1 8B:   20,000 tokens/min
  Whisper:        7,200 audio-sec/hr
  Upgrade to paid tier for production load.
```

---

## 12. Key Design Decisions

### 12.1 Promise-Based Task Queue vs. Direct Event Application

Backend streams all events for a question in < 100ms. Applying events directly causes the microphone to activate before the question audio finishes.

The task queue serialises all audio-carrying events: each task `await`s its audio before the next task starts. `state_change: LISTENING` from the backend is ignored — the frontend owns that transition and fires it only after `await playAsync()` resolves.

*Trade-off:* A hung audio item stalls the queue. The skip button (`taskQueueRef.current = []` + `player.stop()`) is the escape hatch.

---

### 12.2 fastembed (ONNX) vs. sentence-transformers (PyTorch)

Render Free Tier: 512 MB RAM. PyTorch loads ~480 MB before the app starts → OOM. fastembed ONNX: ~80 MB. Same model (`BAAI/bge-small-en-v1.5`), same quality, 6x less RAM.

*Trade-off:* CPU-only. For 10k+ Q&As, re-indexing would take minutes. For 31 questions, < 30 seconds.

---

### 12.3 Groq vs. OpenAI GPT-4o

Groq's hardware delivers LLaMA 3.3 70B at ~600 tokens/sec vs. GPT-4o at ~60 tokens/sec. For a real-time interview, 10x throughput is decisive: evaluation completes in ~1.2s vs. ~12s.

LLaMA 3.3 70B on Groq matches GPT-4o on structured JSON scoring from a rubric. Free tier covers ~10 full interviews/hour.

---

### 12.4 REST Upload vs. WebSocket Blob for Audio

A 2-5 MB blob over WebSocket blocks all events on the WS frame queue — state events arrive after the blob frames, out of order. The split path (REST for blob, WS for lightweight signals) keeps the event bus clear and maintains correct ordering.

---

### 12.5 Teaching Length: Three Enforcement Layers

LLMs ignore length instructions alone. The system uses:
1. **Prompt**: "TOTAL: 2 sentences. STOP." with explicit FORBIDDEN list
2. **`max_tokens=80`**: ~40 tokens per sentence hard cap
3. **Python splitter**: `re.split(r'(?<=[.!?])\s+')` takes first 2 complete sentences, discards any cutoff fragment

Belt-and-suspenders: any single layer failing is caught by the others.

---

*Architecture version 1.0 — 2026-06-27*
