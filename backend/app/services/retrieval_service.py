"""
Retrieval service — lightweight keyword-based similarity search.

Uses Jaccard word-overlap scoring instead of neural embeddings.
For a 31-question dataset this gives perfectly adequate retrieval quality
while using < 5 MB RAM (vs. fastembed ONNX which requires ~300 MB on Render Free Tier).

The public interface is identical to the previous fastembed/FAISS implementation
so no callers need to change.
"""

import json
import logging
import random
import re
from typing import Any, Dict, List, Optional, Tuple

from ..config import settings

logger = logging.getLogger(__name__)

# Common English stop words to ignore in similarity scoring
_STOPWORDS = {
    "a", "an", "the", "is", "it", "its", "in", "of", "to", "and", "or",
    "for", "on", "with", "as", "by", "at", "be", "are", "was", "were",
    "this", "that", "these", "those", "from", "have", "has", "had", "do",
    "does", "did", "will", "would", "could", "should", "can", "may", "what",
    "how", "why", "when", "where", "which", "who", "you", "we", "they",
    "i", "not", "no", "so", "if", "but", "than", "then", "also", "more",
}


def _tokenize(text: str) -> set:
    """Lowercase, strip punctuation, remove stop words."""
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return {t for t in tokens if t not in _STOPWORDS and len(t) > 1}


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


class RetrievalService:
    def __init__(self) -> None:
        self.questions: List[Dict[str, Any]] = []
        self._initialized = False
        # Pre-tokenized corpus for fast repeated searches
        self._corpus_tokens: List[set] = []

    async def initialize(self) -> None:
        if self._initialized:
            return

        logger.info("Loading Q&A dataset from %s", settings.QA_DATASET_PATH)
        with open(settings.QA_DATASET_PATH, encoding="utf-8") as fh:
            dataset = json.load(fh)
        self.questions = dataset["questions"]

        # Pre-tokenise each question + reference answer once
        self._corpus_tokens = [
            _tokenize(f"{q['question']} {q['reference_answer']}")
            for q in self.questions
        ]

        self._initialized = True
        logger.info(
            "Retrieval service ready (%d questions, keyword-based)", len(self.questions)
        )

    # ------------------------------------------------------------------
    # Public interface (identical to the previous fastembed/FAISS version)
    # ------------------------------------------------------------------

    def search(
        self,
        query: str,
        k: int = 3,
        exclude_ids: Optional[List[str]] = None,
    ) -> List[Tuple[Dict[str, Any], float]]:
        """Return top-k (question_dict, similarity_score) pairs for a query."""
        if not self._initialized:
            raise RuntimeError("RetrievalService not initialized")

        query_tokens = _tokenize(query)
        exclude = set(exclude_ids or [])

        scored: List[Tuple[Dict[str, Any], float]] = []
        for q, corpus_tokens in zip(self.questions, self._corpus_tokens):
            if q["id"] in exclude:
                continue
            score = _jaccard(query_tokens, corpus_tokens)
            scored.append((q, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:k]

    def get_reference_for_question(self, question_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a question by ID — direct O(n) lookup."""
        for q in self.questions:
            if q["id"] == question_id:
                return q
        return None

    def select_questions(
        self,
        role: str,
        difficulty: str,
        count: int,
        categories: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Select a diverse, role-appropriate set of questions for an interview."""
        role_category_map: Dict[str, List[str]] = {
            "frontend":      ["JavaScript", "TypeScript", "React", "Databases", "Behavioral"],
            "backend":       ["Python", "System Design", "Databases", "API Design", "Behavioral"],
            "fullstack":     ["JavaScript", "Python", "React", "System Design", "Databases", "Behavioral"],
            "data_engineer": ["Python", "Databases", "Data Structures", "System Design", "Behavioral"],
            "devops":        ["System Design", "Python", "Databases", "API Design", "Behavioral"],
            "general":       list({q["category"] for q in self.questions}),
        }

        target_cats = set(categories or role_category_map.get(role, role_category_map["general"]))

        primary  = [q for q in self.questions if q["difficulty"] == difficulty and q["category"] in target_cats]
        fallback = [q for q in self.questions if q["difficulty"] != difficulty and q["category"] in target_cats]
        pool = primary + fallback

        behavioral = [q for q in pool if q["category"] == "Behavioral"]
        technical  = [q for q in pool if q["category"] != "Behavioral"]

        random.shuffle(behavioral)
        random.shuffle(technical)

        selected: List[Dict[str, Any]] = []
        for q in behavioral[:2]:
            selected.append(q)

        cat_counts: Dict[str, int] = {}
        for q in technical:
            cat = q["category"]
            if cat_counts.get(cat, 0) < 2 and len(selected) < count:
                selected.append(q)
                cat_counts[cat] = cat_counts.get(cat, 0) + 1

        random.shuffle(selected)
        return selected[:count]


retrieval_service = RetrievalService()
