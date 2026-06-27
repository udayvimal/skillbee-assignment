"""
Session management routes.

POST /sessions              — create a new interview session and select questions
GET  /sessions/{id}         — get session metadata
GET  /sessions/{id}/results — get full results for a completed session
"""

import uuid
from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import InterviewAnswerDB, InterviewSessionDB, get_db
from ...models.session import (
    CategoryScore,
    CreateSessionRequest,
    EvaluationResult,
    InterviewState,
    InterviewSummary,
    SessionResponse,
)
from ...services.retrieval_service import retrieval_service

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse, status_code=201)
async def create_session(
    body: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    """Create an interview session and select the question set via RAG retrieval."""
    questions = retrieval_service.select_questions(
        role       = body.role.value,
        difficulty = body.difficulty.value,
        count      = body.question_count,
        categories = body.categories,
    )

    if not questions:
        raise HTTPException(
            status_code=422,
            detail="No questions available for the given parameters",
        )

    session_id = str(uuid.uuid4())
    session    = InterviewSessionDB(
        id                     = session_id,
        candidate_name         = body.candidate_name,
        role                   = body.role.value,
        language               = body.language.value,
        difficulty             = body.difficulty.value,
        state                  = InterviewState.IDLE.value,
        question_ids           = [q["id"] for q in questions],
        current_question_index = 0,
        total_questions        = len(questions),
        created_at             = datetime.utcnow(),
    )
    db.add(session)
    await db.flush()

    return SessionResponse(
        id                     = session_id,
        candidate_name         = session.candidate_name,
        role                   = session.role,
        language               = session.language,
        difficulty             = session.difficulty,
        state                  = session.state,
        current_question_index = 0,
        total_questions        = len(questions),
        created_at             = session.created_at,
    )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    row = await db.get(InterviewSessionDB, session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionResponse(
        id                     = row.id,
        candidate_name         = row.candidate_name,
        role                   = row.role,
        language               = row.language,
        difficulty             = row.difficulty,
        state                  = row.state,
        current_question_index = row.current_question_index,
        total_questions        = row.total_questions or 0,
        created_at             = row.created_at,
    )


@router.get("/{session_id}/results", response_model=InterviewSummary)
async def get_results(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> InterviewSummary:
    """Return the complete interview results for a finished session."""
    row = await db.get(InterviewSessionDB, session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    if row.state not in (InterviewState.SUMMARY.value, InterviewState.COMPLETE.value):
        raise HTTPException(status_code=409, detail="Interview not yet completed")

    result = await db.execute(
        select(InterviewAnswerDB)
        .where(InterviewAnswerDB.session_id == session_id)
        .order_by(InterviewAnswerDB.created_at)
    )
    answer_rows = result.scalars().all()

    evaluations: List[EvaluationResult] = []
    for ans in answer_rows:
        d: Dict[str, Any] = ans.evaluation_data or {}
        evaluations.append(
            EvaluationResult(
                question_id          = ans.question_id,
                question_text        = ans.question_text,
                answer_text          = ans.answer_text or "",
                category             = ans.category or "General",
                accuracy             = float(d.get("accuracy",             d.get("technical_accuracy", 0.0))),
                communication        = float(d.get("communication",        d.get("clarity",            0.0))),
                completeness         = float(d.get("completeness",         0.0)),
                confidence           = float(d.get("confidence",           d.get("practical_knowledge", 0.0))),
                structure            = float(d.get("structure",            0.0)),
                examples_used        = float(d.get("examples_used",        d.get("practical_knowledge", 0.0))),
                score                = ans.score or 0.0,
                feedback             = d.get("feedback",            ""),
                strengths            = d.get("strengths",           []),
                weaknesses           = d.get("weaknesses",          []),
                reference_snippet    = d.get("reference_snippet",   ""),
                ideal_answer         = d.get("ideal_answer",        ""),
                ideal_answer_summary = d.get("ideal_answer_summary",""),
                is_follow_up         = bool(ans.is_follow_up),
            )
        )

    overall   = sum(e.score for e in evaluations) / max(len(evaluations), 1)
    cat_map: Dict[str, List[float]] = {}
    for e in evaluations:
        cat_map.setdefault(e.category, []).append(e.score)

    category_scores = [
        CategoryScore(category=c, score=round(sum(s) / len(s), 2), question_count=len(s))
        for c, s in cat_map.items()
    ]

    duration = (
        (row.completed_at - row.started_at).total_seconds() / 60
        if row.completed_at and row.started_at
        else 0.0
    )

    def grade(s: float) -> str:
        if s >= 9: return "A+"
        if s >= 8: return "A"
        if s >= 7: return "B+"
        if s >= 6: return "B"
        if s >= 5: return "C"
        return "D"

    # Aggregate strengths/weaknesses from all evaluations (de-duplicated)
    seen_s: set = set()
    seen_w: set = set()
    strengths:  List[str] = []
    weaknesses: List[str] = []
    for ev in evaluations:
        for s in ev.strengths:
            if s not in seen_s:
                seen_s.add(s); strengths.append(s)
        for w in ev.weaknesses:
            if w not in seen_w:
                seen_w.add(w); weaknesses.append(w)

    return InterviewSummary(
        session_id                 = session_id,
        candidate_name             = row.candidate_name,
        role                       = row.role,
        overall_score              = round(overall, 2),
        grade                      = grade(overall),
        category_scores            = category_scores,
        evaluations                = evaluations,
        strengths                  = strengths[:6],
        weaknesses                 = weaknesses[:6],
        improvement_suggestions    = [],
        interview_duration_minutes = round(duration, 1),
        completed_at               = row.completed_at or datetime.utcnow(),
        overall_impression         = "",
        hiring_signal              = "maybe",
        summary_speech             = "",
    )
