"""
Grounded evaluation service.

Every score is derived from a reference answer retrieved from the Q&A dataset.
The LLM never scores from memory alone — it receives the canonical reference
as explicit context, ensuring reproducible, calibrated feedback.

Prompt templates live in backend/app/prompts/*.md (not inline) so they can be
edited without touching service logic.
"""

import json
import logging
import random
import re
from typing import Any, Dict, List

from ..config import settings
from ..models.session import EvaluationResult
from .llm_service import llm_service
from .prompt_loader import (
    EVALUATION_PROMPT,
    FEEDBACK_PROMPT,
    FOLLOWUP_PROMPT,
    TEACHING_PROMPT,
)
from .retrieval_service import retrieval_service

logger = logging.getLogger(__name__)

# ── Language-specific copy (non-LLM, for fast deterministic strings) ─────────

_LANG_INTROS = {
    "en": (
        "Hello {name}! I'm TechMind AI, your technical interviewer today. "
        "We'll work through {count} questions for a {role} role. "
        "Speak naturally — I'll evaluate each answer and give you feedback right away. "
        "If you need more time on a question, just say so. Let's begin."
    ),
    "hi": (
        "नमस्ते {name}! मैं TechMind AI हूं, आज आपका technical interviewer। "
        "हम {role} role के लिए {count} questions cover करेंगे। "
        "स्वाभाविक रूप से बोलें — मैं हर answer evaluate करूंगा और तुरंत feedback दूंगा। "
        "चलिए शुरू करते हैं।"
    ),
    "de": (
        "Hallo {name}! Ich bin TechMind AI, Ihr technischer Interviewer heute. "
        "Wir werden {count} Fragen für eine {role}-Stelle durchgehen. "
        "Sprechen Sie natürlich — ich werde jede Antwort sofort bewerten. "
        "Lassen Sie uns beginnen."
    ),
}

_LANG_TRANSITIONS = {
    "en": [
        "Good answer. Let's move to the next question.",
        "Thank you. Here's your next question.",
        "Alright, moving on.",
        "Got it. Next question coming up.",
    ],
    "hi": [
        "अच्छा जवाब। अगले प्रश्न पर चलते हैं।",
        "धन्यवाद। अगला प्रश्न यह है।",
        "ठीक है, आगे बढ़ते हैं।",
    ],
    "de": [
        "Gut. Kommen wir zur nächsten Frage.",
        "Danke. Hier ist Ihre nächste Frage.",
        "Alles klar, weiter geht's.",
    ],
}

_LANG_SUMMARY_INTRO = {
    "en": "The interview is now complete. Here's your performance summary.",
    "hi": "Interview पूरा हो गया। यह रहा आपका performance summary।",
    "de": "Das Interview ist abgeschlossen. Hier ist Ihre Leistungszusammenfassung.",
}


class EvaluationService:

    # ── Public methods ─────────────────────────────────────────────────────────

    async def evaluate_answer(
        self,
        question_id: str,
        question_text: str,
        answer_text: str,
        category: str,
        language: str = "en",
        is_follow_up: bool = False,
    ) -> EvaluationResult:
        """
        Evaluate a candidate's answer against the grounded reference.

        Pipeline:
        1. Fetch reference answer directly by question_id (primary ground truth)
        2. FAISS-search the answer text for supplementary related Q&As
        3. Pass both to LLM with the evaluation prompt
        4. Parse structured JSON response into EvaluationResult
        """
        reference_qa  = retrieval_service.get_reference_for_question(question_id)
        similar       = retrieval_service.search(answer_text, k=2, exclude_ids=[question_id])

        reference_text = reference_qa["reference_answer"] if reference_qa else "No reference available."
        key_points     = reference_qa.get("key_points", []) if reference_qa else []
        ideal_answer   = reference_qa.get("reference_answer", "") if reference_qa else ""

        supplementary = "\n".join(
            f"- Q: {r['question']} → Key points: {', '.join(r.get('key_points', []))}"
            for r, _ in similar
        )

        lang_instruction = {
            "hi": "IMPORTANT: Write the 'feedback' and 'ideal_answer_summary' fields in Hindi.",
            "de": "IMPORTANT: Write the 'feedback' and 'ideal_answer_summary' fields in German (Deutsch).",
        }.get(language, "")

        user_prompt = (
            f"QUESTION: {question_text}\n\n"
            f"CANDIDATE ANSWER: {answer_text or '[No answer — candidate skipped]'}\n\n"
            f"REFERENCE ANSWER: {reference_text}\n\n"
            f"KEY POINTS TO CHECK: {', '.join(key_points)}\n\n"
            f"RELATED CONTEXT:\n{supplementary}"
            + (f"\n\n{lang_instruction}" if lang_instruction else "")
        )

        raw = await llm_service.chat(
            messages=[
                {"role": "system", "content": EVALUATION_PROMPT},
                {"role": "user",   "content": user_prompt},
            ],
            model=settings.GROQ_MODEL,
            temperature=0.2,
            max_tokens=1200,
        )

        d = self._parse_json(raw)
        score = float(d.get("score", 5.0))

        return EvaluationResult(
            question_id           = question_id,
            question_text         = question_text,
            answer_text           = answer_text or "",
            category              = category,
            accuracy              = round(float(d.get("accuracy",       5.0)), 2),
            communication         = round(float(d.get("communication",  5.0)), 2),
            completeness          = round(float(d.get("completeness",   5.0)), 2),
            confidence            = round(float(d.get("confidence",     5.0)), 2),
            structure             = round(float(d.get("structure",      5.0)), 2),
            examples_used         = round(float(d.get("examples_used",  5.0)), 2),
            score                 = round(score, 2),
            feedback              = d.get("feedback", ""),
            strengths             = d.get("strengths", []),
            weaknesses            = d.get("weaknesses", []),
            reference_snippet     = d.get("reference_snippet", ""),
            ideal_answer          = ideal_answer,
            ideal_answer_summary  = d.get("ideal_answer_summary", ""),
            is_follow_up          = is_follow_up,
        )

    async def generate_follow_up(
        self,
        question_text: str,
        answer_text: str,
        weaknesses: List[str],
        language: str = "en",
    ) -> str:
        """Generate a targeted follow-up question for a partial answer (score 5–8)."""
        lang_note = {"hi": " Respond in Hindi.", "de": " Respond in German (Deutsch)."}.get(language, "")
        prompt = (
            f"Original question: {question_text}\n"
            f"Candidate answer: {answer_text}\n"
            f"Identified weaknesses: {', '.join(weaknesses)}"
            + lang_note
        )
        text = await llm_service.chat_fast(
            messages=[
                {"role": "system", "content": FOLLOWUP_PROMPT},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.6,
        )
        return text.strip()

    async def generate_teaching(
        self,
        question_text: str,
        answer_text: str,
        ideal_answer: str,
        key_points: List[str],
        language: str = "en",
    ) -> str:
        """
        Generate a teaching message for a weak answer (score < 5).
        This is spoken aloud to the candidate to explain what was missing
        and briefly reveal the ideal approach.
        """
        lang_note = {"hi": " Respond in Hindi.", "de": " Respond in German (Deutsch)."}.get(language, "")
        prompt = (
            f"Question: {question_text}\n"
            f"Candidate answer: {answer_text or '[No answer given]'}\n"
            f"Ideal answer: {ideal_answer}\n"
            f"Key points the candidate missed: {', '.join(key_points)}"
            + lang_note
        )
        raw = await llm_service.chat_fast(
            messages=[
                {"role": "system", "content": TEACHING_PROMPT},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.5,
            max_tokens=80,
        )
        # Hard-enforce 2 complete sentences regardless of what LLM returns.
        # Split on period/exclamation/question then rejoin first 2 only.
        import re
        parts = [s.strip() for s in re.split(r'(?<=[.!?])\s+', raw.strip()) if s.strip()]
        two = " ".join(parts[:2])
        # If the last char isn't punctuation (token cutoff), drop the fragment
        if two and two[-1] not in ".!?":
            two = " ".join(parts[:1])
        return two.strip() or raw.strip()

    async def generate_summary(
        self,
        evaluations: List[EvaluationResult],
        candidate_name: str,
        role: str,
        language: str = "en",
    ) -> Dict[str, Any]:
        """Synthesise a complete post-interview assessment from all evaluations."""
        eval_text = "\n\n".join(
            f"Q{i+1} [{e.category}] Score={e.score}/10\n"
            f"Question: {e.question_text}\n"
            f"Answer: {e.answer_text[:300]}{'...' if len(e.answer_text) > 300 else ''}\n"
            f"Accuracy={e.accuracy} Communication={e.communication} "
            f"Completeness={e.completeness} Confidence={e.confidence}\n"
            f"Feedback: {e.feedback}\n"
            f"Strengths: {e.strengths}\nWeaknesses: {e.weaknesses}"
            for i, e in enumerate(evaluations)
        )

        prompt = (
            f"Candidate: {candidate_name} | Role: {role} | Language: {language}\n\n"
            f"FULL EVALUATION DATA:\n{eval_text}"
        )

        raw = await llm_service.chat(
            messages=[
                {"role": "system", "content": FEEDBACK_PROMPT},
                {"role": "user",   "content": prompt},
            ],
            model=settings.GROQ_MODEL,
            temperature=0.3,
            max_tokens=1400,
        )
        return self._parse_json(raw)

    # ── Language helpers ───────────────────────────────────────────────────────

    def get_intro_text(self, name: str, role: str, count: int, language: str) -> str:
        template = _LANG_INTROS.get(language, _LANG_INTROS["en"])
        return template.format(name=name, role=role, count=count)

    def get_transition_text(self, language: str) -> str:
        options = _LANG_TRANSITIONS.get(language, _LANG_TRANSITIONS["en"])
        return random.choice(options)

    def get_summary_intro(self, language: str) -> str:
        return _LANG_SUMMARY_INTRO.get(language, _LANG_SUMMARY_INTRO["en"])

    # ── Internal ───────────────────────────────────────────────────────────────

    def _parse_json(self, raw: str) -> Dict[str, Any]:
        """Robustly extract JSON from an LLM response."""
        text = raw.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", text, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
            logger.error("Failed to parse LLM JSON response: %s", text[:300])
            return {}


evaluation_service = EvaluationService()
