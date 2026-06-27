"""
WebSocket handler — the real-time backbone of the interview.

Client → Server:
  {"type": "start"}          — begin interview
  {"type": "answer_ready"}   — audio submitted via REST, pick up pending answer
  {"type": "skip"}           — skip current question
  {"type": "ping"}           — keepalive

Server → Client:
  {"type": "connected",    "data": {...}}
  {"type": "state_change", "data": {"state": "..."}}
  {"type": "intro",        "data": {...}}
  {"type": "question",     "data": {...}}
  {"type": "transcript",   "data": {...}}
  {"type": "evaluation",   "data": {...}}
  {"type": "follow_up",    "data": {...}}
  {"type": "transition",   "data": {...}}
  {"type": "summary",      "data": {...}}
  {"type": "error",        "data": {"message": "..."}}
  {"type": "pong"}
"""

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.websockets import WebSocketState
from sqlalchemy.ext.asyncio import AsyncSession

from ...database import AsyncSessionLocal
from ...models.session import InterviewState
from ...services.interview_engine import (
    InterviewSession,
    get_active_session,
    register_session,
    unregister_session,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])


async def _send(ws: WebSocket, event: dict) -> bool:
    """Send a JSON event. Returns False if the connection is no longer open."""
    try:
        if ws.client_state == WebSocketState.CONNECTED:
            await ws.send_json(event)
            return True
    except Exception:
        pass
    return False


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    logger.info("WS connected: %s", session_id)

    db: AsyncSession = AsyncSessionLocal()
    session: Optional[InterviewSession] = None

    try:
        # ── Load or restore interview session ──────────────────────────────
        existing = get_active_session(session_id)
        if existing:
            session = existing
        else:
            session = InterviewSession(session_id=session_id, db_session=db)
            try:
                await session.attach()
            except ValueError as exc:
                # Session not found in DB — tell client and close cleanly
                logger.warning("Session not found: %s — %s", session_id, exc)
                await _send(websocket, {"type": "error", "data": {
                    "code": "SESSION_NOT_FOUND",
                    "message": str(exc),
                }})
                await websocket.close(code=1008, reason="session not found")
                return
            register_session(session)

        # ── Notify client of current state ────────────────────────────────
        await _send(websocket, {
            "type": "connected",
            "data": {
                "session_id": session_id,
                "state": session.state.value,
                "current_question_index": session.current_index,
                "total_questions": len(session.questions),
            },
        })

        # ── Main event loop ────────────────────────────────────────────────
        answer_processing = False  # guard: prevent re-entrant answer processing
        while True:
            # Poll for answers submitted via the REST audio endpoint
            if getattr(session, "_pending_answer", None) and not answer_processing:
                transcript, is_follow_up = session._pending_answer
                session._pending_answer = None
                answer_processing = True
                try:
                    gen = (
                        session.process_follow_up_answer(transcript)
                        if (is_follow_up or session.state == InterviewState.FOLLOW_UP)
                        else session.process_answer(transcript)
                    )
                    async for event in gen:
                        await _send(websocket, event)
                finally:
                    answer_processing = False
                continue

            # Wait for client message; short timeout keeps the poll loop alive
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            except WebSocketDisconnect:
                break

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await _send(websocket, {"type": "error", "data": {"message": "Invalid JSON"}})
                continue

            msg_type = msg.get("type", "")

            if msg_type == "ping":
                await _send(websocket, {"type": "pong"})

            elif msg_type == "start":
                if session.state != InterviewState.IDLE:
                    await _send(websocket, {"type": "error", "data": {
                        "message": f"Already in state {session.state.value}",
                    }})
                    continue
                async for event in session.start():
                    await _send(websocket, event)
                async for event in session.deliver_question():
                    await _send(websocket, event)

            elif msg_type == "skip":
                session.current_index += 1
                await session._persist_state()
                if session.current_index >= len(session.questions):
                    async for event in session.finalize():
                        await _send(websocket, event)
                else:
                    async for event in session.deliver_question():
                        await _send(websocket, event)

            elif msg_type == "ready_to_listen":
                # Client finished playing question audio — now safe to accept answers
                await session.client_ready_to_listen()
                await _send(websocket, {"type": "state_change", "data": {"state": "LISTENING"}})

            elif msg_type == "answer_ready":
                pass  # pending answer will be picked up next iteration

            else:
                await _send(websocket, {"type": "error", "data": {
                    "message": f"Unknown message type: {msg_type}",
                }})

    except WebSocketDisconnect:
        logger.info("WS client disconnected: %s", session_id)
    except Exception as exc:
        logger.error("WS unhandled error [%s]: %s", session_id, exc, exc_info=True)
        await _send(websocket, {"type": "error", "data": {"message": str(exc)}})
    finally:
        unregister_session(session_id)
        await db.close()
        logger.info("WS session closed: %s", session_id)
