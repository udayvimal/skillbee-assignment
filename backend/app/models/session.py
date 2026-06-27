from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class InterviewState(str, Enum):
    IDLE       = "IDLE"
    INTRO      = "INTRO"
    QUESTION   = "QUESTION"
    LISTENING  = "LISTENING"
    PROCESSING = "PROCESSING"
    EVALUATING = "EVALUATING"
    FOLLOW_UP  = "FOLLOW_UP"
    TEACHING   = "TEACHING"
    SUMMARY    = "SUMMARY"
    COMPLETE   = "COMPLETE"


class DifficultyLevel(str, Enum):
    EASY   = "easy"
    MEDIUM = "medium"
    HARD   = "hard"


class Language(str, Enum):
    ENGLISH = "en"
    HINDI   = "hi"
    GERMAN  = "de"


class Role(str, Enum):
    FRONTEND     = "frontend"
    BACKEND      = "backend"
    FULLSTACK    = "fullstack"
    DATA_ENGINEER = "data_engineer"
    DEVOPS       = "devops"
    GENERAL      = "general"


class CreateSessionRequest(BaseModel):
    candidate_name: str = Field(..., min_length=1, max_length=100)
    role: Role = Role.GENERAL
    language: Language = Language.ENGLISH
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    question_count: int = Field(default=8, ge=3, le=15)
    categories: Optional[List[str]] = None


class SessionResponse(BaseModel):
    id: str
    candidate_name: str
    role: str
    language: str
    difficulty: str
    state: str
    current_question_index: int
    total_questions: int
    created_at: datetime


class EvaluationResult(BaseModel):
    question_id: str
    question_text: str
    answer_text: str
    category: str
    # Assignment-required dimensions (6 sub-scores, each 0-10)
    accuracy: float = 0.0           # technical correctness  (35%)
    communication: float = 0.0     # clarity & articulation  (20%)
    completeness: float = 0.0      # key-point coverage      (25%)
    confidence: float = 0.0        # certainty of delivery   (10%)
    structure: float = 0.0         # logical organization     (5%)
    examples_used: float = 0.0     # real-world examples      (5%)
    score: float = 0.0             # weighted overall (0-10)
    feedback: str = ""
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    reference_snippet: str = ""    # brief excerpt shown in results
    ideal_answer: str = ""         # full reference answer (shown after evaluation)
    ideal_answer_summary: str = "" # LLM-generated 2-sentence distillation
    is_follow_up: bool = False


class CategoryScore(BaseModel):
    category: str
    score: float
    question_count: int


class InterviewSummary(BaseModel):
    session_id: str
    candidate_name: str
    role: str
    overall_score: float
    grade: str
    category_scores: List[CategoryScore]
    evaluations: List[EvaluationResult]
    strengths: List[str]
    weaknesses: List[str]
    improvement_suggestions: List[str]
    interview_duration_minutes: float
    completed_at: datetime
    overall_impression: str = ""
    hiring_signal: str = "maybe"
    summary_speech: str = ""


class WSMessage(BaseModel):
    type: str
    data: Dict[str, Any]
