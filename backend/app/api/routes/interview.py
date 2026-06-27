"""
Audio submission endpoint.

The frontend records audio and POSTs it here after the user clicks "Done Speaking".
This route:
  1. Transcribes audio via Groq Whisper
  2. Routes the transcript to the active WebSocket session's engine
  3. Returns the transcript immediately so the frontend can show it without waiting for evaluation
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import InterviewSessionDB, get_db
from ...models.session import InterviewState
from ...services.interview_engine import get_active_session
from ...services.stt_service import stt_service

router = APIRouter(prefix="/interview", tags=["interview"])


@router.post("/{session_id}/submit-audio")
async def submit_audio(
    session_id: str,
    audio: UploadFile = File(..., description="Recorded audio file (webm/wav/ogg)"),
    is_follow_up: bool = Form(default=False),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Receive recorded audio, transcribe it, and push the transcript
    to the active interview session for evaluation.

    Returns the transcript immediately; evaluation arrives via WebSocket.
    """
    row = await db.get(InterviewSessionDB, session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    active = get_active_session(session_id)
    if not active:
        raise HTTPException(
            status_code=409,
            detail="No active WebSocket session found. Please reconnect.",
        )

    if active.state not in (InterviewState.LISTENING, InterviewState.FOLLOW_UP):
        raise HTTPException(
            status_code=409,
            detail=f"Session is in state {active.state.value}, not ready for audio input.",
        )

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    transcript = await stt_service.transcribe(
        audio_bytes=audio_bytes,
        language=active.language,
        filename=audio.filename or "audio.webm",
    )

    # Push to the active engine asynchronously via internal queue
    # (The WebSocket handler picks this up and streams events back)
    active._pending_answer = (transcript, is_follow_up)

    return {"transcript": transcript, "session_id": session_id}


@router.get("/{session_id}/status")
async def get_status(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = await db.get(InterviewSessionDB, session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    active = get_active_session(session_id)
    return {
        "session_id": session_id,
        "state": active.state.value if active else row.state,
        "current_question_index": active.current_index if active else row.current_question_index,
        "total_questions": row.total_questions or 0,
        "connected": active is not None,
    }
