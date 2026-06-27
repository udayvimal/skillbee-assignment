"""
Interview engine: the state machine that orchestrates a complete interview session.

State transitions (exactly per assignment):
  IDLE → INTRO → QUESTION → LISTENING → PROCESSING → EVALUATING
                                                        ↓
                                              score >= 8 → NEXT_QUESTION
                                              5 <= score < 8 → FOLLOW_UP → LISTENING
                                              score < 5 → TEACHING → NEXT_QUESTION
                                                              ↓ (all done)
                                                            SUMMARY → COMPLETE
"""

import base64
import logging
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import InterviewAnswerDB, InterviewSessionDB
from ..models.session import (
    CategoryScore,
    EvaluationResult,
    InterviewState,
    InterviewSummary,
)
from .evaluation_service import evaluation_service
from .retrieval_service import retrieval_service
from .tts_service import tts_service

logger = logging.getLogger(__name__)


def _grade(score: float) -> str:
    if score >= 9: return "A+"
    if score >= 8: return "A"
    if score >= 7: return "B+"
    if score >= 6: return "B"
    if score >= 5: return "C"
    return "D"


class InterviewSession:
    """
    In-memory session object kept alive for the duration of a WebSocket connection.
    Persists answers to SQLite after each question.
    """

    def __init__(self, session_id: str, db_session: AsyncSession) -> None:
        self.session_id = session_id
        self.db = db_session
        self.state = InterviewState.IDLE

        self.candidate_name: str = ""
        self.role: str = ""
        self.language: str = "en"
        self.difficulty: str = "medium"
        self.questions: List[Dict[str, Any]] = []
        self.current_index: int = 0
        self.evaluations: List[EvaluationResult] = []
        self.started_at: Optional[datetime] = None
        self._pending_answer: Optional[tuple] = None  # (transcript, is_follow_up)

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def attach(self) -> None:
        """Load session data from DB and restore state."""
        row: Optional[InterviewSessionDB] = await self.db.get(
            InterviewSessionDB, self.session_id
        )
        if not row:
            raise ValueError(f"Session {self.session_id} not found")

        self.candidate_name = row.candidate_name
        self.role           = row.role
        self.language       = row.language
        self.difficulty     = row.difficulty
        self.state          = InterviewState(row.state)
        self.current_index  = row.current_question_index
        self.started_at     = row.started_at

        for qid in row.question_ids or []:
            q = retrieval_service.get_reference_for_question(qid)
            if q:
                self.questions.append(q)

    # ── State machine ──────────────────────────────────────────────────────────

    async def start(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Deliver intro and begin."""
        self.state      = InterviewState.INTRO
        self.started_at = datetime.utcnow()
        await self._persist_state()

        intro_text = evaluation_service.get_intro_text(
            self.candidate_name, self.role, len(self.questions), self.language
        )
        audio = await tts_service.synthesize(intro_text, self.language)

        yield self._state_event()
        yield {
            "type": "intro",
            "data": {
                "text": intro_text,
                "audio": base64.b64encode(audio).decode() if audio else None,
                "candidate_name": self.candidate_name,
                "total_questions": len(self.questions),
                "role": self.role,
                "language": self.language,
            },
        }

    async def deliver_question(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Deliver the current question via text and TTS."""
        if self.current_index >= len(self.questions):
            async for event in self.finalize():
                yield event
            return

        self.state = InterviewState.QUESTION
        await self._persist_state()

        q             = self.questions[self.current_index]
        question_text = q["question"]
        audio         = await tts_service.synthesize(question_text, self.language)

        yield self._state_event()
        yield {
            "type": "question",
            "data": {
                "question_id":      q["id"],
                "question_text":    question_text,
                "category":         q["category"],
                "difficulty":       q["difficulty"],
                "question_num":     self.current_index + 1,
                "total_questions":  len(self.questions),
                "audio":            base64.b64encode(audio).decode() if audio else None,
            },
        }

        self.state = InterviewState.LISTENING
        await self._persist_state()
        yield self._state_event()

    async def process_answer(
        self, answer_text: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Evaluate the answer, then route to the appropriate next state:
          score >= 8   → next question
          5 <= score < 8 → follow-up question
          score < 5    → teaching + next question
        """
        q = self.questions[self.current_index]

        self.state = InterviewState.PROCESSING
        await self._persist_state()
        yield self._state_event()
        yield {"type": "transcript", "data": {"text": answer_text, "is_final": True}}

        self.state = InterviewState.EVALUATING
        await self._persist_state()
        yield self._state_event()

        ev = await evaluation_service.evaluate_answer(
            question_id  = q["id"],
            question_text= q["question"],
            answer_text  = answer_text,
            category     = q["category"],
            language     = self.language,
            is_follow_up = False,
        )
        self.evaluations.append(ev)
        await self._save_answer(q, answer_text, ev, is_follow_up=False)

        feedback_audio = await tts_service.synthesize(ev.feedback, self.language)
        yield {
            "type": "evaluation",
            "data": {
                "question_id":       ev.question_id,
                "score":             ev.score,
                "accuracy":          ev.accuracy,
                "communication":     ev.communication,
                "completeness":      ev.completeness,
                "confidence":        ev.confidence,
                "structure":         ev.structure,
                "examples_used":     ev.examples_used,
                "feedback":          ev.feedback,
                "strengths":         ev.strengths,
                "weaknesses":        ev.weaknesses,
                "ideal_answer_summary": ev.ideal_answer_summary,
                "audio":             base64.b64encode(feedback_audio).decode() if feedback_audio else None,
            },
        }

        # ── 3-tier routing ────────────────────────────────────────────────────
        if ev.score >= settings.SCORE_NEXT_QUESTION:
            # Score >= 8: advance directly
            async for event in self._advance_question():
                yield event

        elif ev.score >= settings.SCORE_FOLLOW_UP:
            # Score 5–8: one intelligent follow-up
            async for event in self._deliver_follow_up(q, ev):
                yield event

        else:
            # Score < 5: teach the concept, reveal ideal answer, then advance
            async for event in self._deliver_teaching(q, ev):
                yield event

    async def process_follow_up_answer(
        self, answer_text: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Evaluate a follow-up answer (lighter) then advance."""
        q = self.questions[self.current_index]

        yield {"type": "transcript", "data": {"text": answer_text, "is_final": True}}

        ev = await evaluation_service.evaluate_answer(
            question_id  = q["id"],
            question_text= f"[Follow-up] {q['question']}",
            answer_text  = answer_text,
            category     = q["category"],
            language     = self.language,
            is_follow_up = True,
        )
        self.evaluations.append(ev)
        await self._save_answer(q, answer_text, ev, is_follow_up=True)

        feedback_audio = await tts_service.synthesize(ev.feedback, self.language)
        yield {
            "type": "evaluation",
            "data": {
                "question_id":   ev.question_id,
                "score":         ev.score,
                "accuracy":      ev.accuracy,
                "communication": ev.communication,
                "completeness":  ev.completeness,
                "confidence":    ev.confidence,
                "structure":     ev.structure,
                "examples_used": ev.examples_used,
                "feedback":      ev.feedback,
                "strengths":     ev.strengths,
                "weaknesses":    ev.weaknesses,
                "is_follow_up":  True,
                "audio":         base64.b64encode(feedback_audio).decode() if feedback_audio else None,
            },
        }

        async for event in self._advance_question():
            yield event

    async def finalize(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate final summary and mark complete."""
        self.state = InterviewState.SUMMARY
        await self._persist_state()
        yield self._state_event()

        summary_data = await evaluation_service.generate_summary(
            evaluations    = self.evaluations,
            candidate_name = self.candidate_name,
            role           = self.role,
            language       = self.language,
        )

        overall = sum(e.score for e in self.evaluations) / max(len(self.evaluations), 1)

        cat_map: Dict[str, List[float]] = {}
        for e in self.evaluations:
            cat_map.setdefault(e.category, []).append(e.score)
        category_scores = [
            CategoryScore(category=c, score=round(sum(s)/len(s), 2), question_count=len(s))
            for c, s in cat_map.items()
        ]

        duration = (
            (datetime.utcnow() - self.started_at).total_seconds() / 60
            if self.started_at else 0
        )

        summary = InterviewSummary(
            session_id                 = self.session_id,
            candidate_name             = self.candidate_name,
            role                       = self.role,
            overall_score              = round(overall, 2),
            grade                      = _grade(overall),
            category_scores            = category_scores,
            evaluations                = self.evaluations,
            strengths                  = summary_data.get("top_strengths", []),
            weaknesses                 = summary_data.get("key_weaknesses", []),
            improvement_suggestions    = [
                f"{s['area']}: {s['suggestion']}"
                for s in summary_data.get("improvement_suggestions", [])
                if isinstance(s, dict)
            ],
            interview_duration_minutes = round(duration, 1),
            completed_at               = datetime.utcnow(),
            overall_impression         = summary_data.get("overall_impression", ""),
            hiring_signal              = summary_data.get("hiring_signal", "maybe"),
            summary_speech             = summary_data.get("summary_speech", ""),
        )

        row: Optional[InterviewSessionDB] = await self.db.get(
            InterviewSessionDB, self.session_id
        )
        if row:
            row.state        = InterviewState.COMPLETE.value
            row.completed_at = summary.completed_at
            await self.db.flush()

        self.state = InterviewState.COMPLETE

        # Speak the summary_speech field (or generic summary intro as fallback)
        speech_text = summary.summary_speech or evaluation_service.get_summary_intro(self.language)
        summary_audio = await tts_service.synthesize(speech_text, self.language)

        yield {
            "type": "summary",
            "data": {
                **summary.model_dump(mode="json"),
                "audio": base64.b64encode(summary_audio).decode() if summary_audio else None,
            },
        }
        yield self._state_event()

    # ── Private routing helpers ────────────────────────────────────────────────

    async def _advance_question(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Move to the next question (or finalize if all done)."""
        self.current_index += 1
        await self._persist_state()

        if self.current_index >= len(self.questions):
            async for event in self.finalize():
                yield event
        else:
            transition       = evaluation_service.get_transition_text(self.language)
            transition_audio = await tts_service.synthesize(transition, self.language)
            yield {
                "type": "transition",
                "data": {
                    "text":               transition,
                    "audio":              base64.b64encode(transition_audio).decode() if transition_audio else None,
                    "next_question_num":  self.current_index + 1,
                },
            }
            async for event in self.deliver_question():
                yield event

    async def _deliver_follow_up(
        self, q: Dict[str, Any], ev: EvaluationResult
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Score 5–8: ask one intelligent follow-up question."""
        self.state = InterviewState.FOLLOW_UP
        await self._persist_state()
        yield self._state_event()

        follow_up_text  = await evaluation_service.generate_follow_up(
            question_text = q["question"],
            answer_text   = ev.answer_text,
            weaknesses    = ev.weaknesses,
            language      = self.language,
        )
        follow_up_audio = await tts_service.synthesize(follow_up_text, self.language)

        yield {
            "type": "follow_up",
            "data": {
                "question_id": q["id"],
                "text":        follow_up_text,
                "audio":       base64.b64encode(follow_up_audio).decode() if follow_up_audio else None,
            },
        }

        self.state = InterviewState.LISTENING
        await self._persist_state()
        yield self._state_event()

    async def _deliver_teaching(
        self, q: Dict[str, Any], ev: EvaluationResult
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Score < 5: teach the concept, reveal the ideal answer, then advance.
        The candidate is NOT asked another question — they need to study first.
        """
        self.state = InterviewState.TEACHING
        await self._persist_state()
        yield self._state_event()

        reference_qa  = retrieval_service.get_reference_for_question(q["id"])
        ideal_answer  = reference_qa.get("reference_answer", "") if reference_qa else ""
        key_points    = reference_qa.get("key_points", []) if reference_qa else []

        teaching_text = await evaluation_service.generate_teaching(
            question_text = q["question"],
            answer_text   = ev.answer_text,
            ideal_answer  = ideal_answer,
            key_points    = key_points,
            language      = self.language,
        )
        teaching_audio = await tts_service.synthesize(teaching_text, self.language)

        yield {
            "type": "teaching",
            "data": {
                "question_id":  q["id"],
                "text":         teaching_text,
                "ideal_answer": ideal_answer,
                "key_points":   key_points,
                "audio":        base64.b64encode(teaching_audio).decode() if teaching_audio else None,
            },
        }

        # Auto-advance after teaching — no more listening on this question
        async for event in self._advance_question():
            yield event

    # ── Low-level helpers ──────────────────────────────────────────────────────

    def _state_event(self) -> Dict[str, Any]:
        return {"type": "state_change", "data": {"state": self.state.value}}

    async def _persist_state(self) -> None:
        """Flush current state and question index to SQLite."""
        row: Optional[InterviewSessionDB] = await self.db.get(
            InterviewSessionDB, self.session_id
        )
        if row:
            row.state = self.state.value
            row.current_question_index = self.current_index
            if self.started_at and not row.started_at:
                row.started_at = self.started_at
            await self.db.flush()

    async def _save_answer(
        self,
        q: Dict[str, Any],
        answer_text: str,
        ev: EvaluationResult,
        is_follow_up: bool,
    ) -> None:
        """Persist a candidate answer + evaluation to SQLite."""
        answer_row = InterviewAnswerDB(
            session_id      = self.session_id,
            question_id     = q["id"],
            question_text   = q["question"],
            category        = q["category"],
            answer_text     = answer_text,
            is_follow_up    = int(is_follow_up),
            score           = ev.score,
            evaluation_data = ev.model_dump(mode="json"),
        )
        self.db.add(answer_row)
        await self.db.flush()


# ── Session registry ───────────────────────────────────────────────────────────

_active_sessions: Dict[str, InterviewSession] = {}


def get_active_session(session_id: str) -> Optional[InterviewSession]:
    return _active_sessions.get(session_id)


def register_session(session: InterviewSession) -> None:
    _active_sessions[session.session_id] = session


def unregister_session(session_id: str) -> None:
    _active_sessions.pop(session_id, None)
