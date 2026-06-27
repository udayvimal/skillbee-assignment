"""
Retrieval service — pure-Python TF-IDF cosine similarity.

Why not fastembed/FAISS:
  fastembed ONNX model (130 MB) + ONNX Runtime (100 MB) + FastAPI app
  exceeded Render Free Tier 512 MB RAM limit at startup.

Why TF-IDF is good enough here:
  - Dataset is 31 technical Q&As with highly distinctive vocabulary
  - Rare technical terms (GIL, coroutine, idempotent, B-tree) get high IDF weight
  - TF-IDF cosine similarity ≈ semantic similarity for domain-specific vocabulary
  - The primary grounding is get_reference_for_question() (direct lookup by ID),
    which is always exact. search() provides supplementary context only.
  - < 5 MB RAM, sub-millisecond query time, no downloads at startup

Public interface is identical to the previous fastembed/FAISS implementation.
"""

import json
import logging
import math
import random
import re
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

from ..config import settings

logger = logging.getLogger(__name__)

_STOPWORDS = {
    "a", "an", "the", "is", "it", "its", "in", "of", "to", "and", "or",
    "for", "on", "with", "as", "by", "at", "be", "are", "was", "were",
    "this", "that", "these", "those", "from", "have", "has", "had", "do",
    "does", "did", "will", "would", "could", "should", "can", "may", "what",
    "how", "why", "when", "where", "which", "who", "you", "we", "they",
    "i", "not", "no", "so", "if", "but", "than", "then", "also", "more",
    "just", "very", "used", "using", "use", "make", "makes", "made", "get",
    "gets", "one", "two", "three", "each", "any", "all", "some", "such",
    "between", "into", "through", "during", "before", "after", "above",
    "below", "up", "down", "out", "off", "over", "under", "again",
}


def _tokenize(text: str) -> List[str]:
    """Lowercase + strip punctuation + remove stop words. Keeps duplicates for TF."""
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return [t for t in tokens if t not in _STOPWORDS and len(t) > 1]


class _TFIDF:
    """Minimal TF-IDF engine — no external dependencies."""

    def __init__(self) -> None:
        self._corpus_tokens: List[List[str]] = []
        self._idf: Dict[str, float] = {}
        self._corpus_vecs: List[Dict[str, float]] = []

    def fit(self, corpus: List[str]) -> None:
        N = len(corpus)
        self._corpus_tokens = [_tokenize(doc) for doc in corpus]

        # Document frequency
        df: Counter = Counter()
        for tokens in self._corpus_tokens:
            for term in set(tokens):
                df[term] += 1

        # Smoothed IDF: log((N+1)/(df+1)) + 1  (same as sklearn default)
        self._idf = {
            term: math.log((N + 1) / (count + 1)) + 1.0
            for term, count in df.items()
        }

        # Pre-compute and L2-normalise each document vector
        self._corpus_vecs = [self._vectorise(tokens) for tokens in self._corpus_tokens]

    def _vectorise(self, tokens: List[str]) -> Dict[str, float]:
        """TF-IDF vector, L2-normalised."""
        if not tokens:
            return {}
        tf = Counter(tokens)
        n = len(tokens)
        vec = {
            term: (tf[term] / n) * self._idf.get(term, 0.0)
            for term in tf
        }
        norm = math.sqrt(sum(v * v for v in vec.values()))
        if norm > 0:
            vec = {k: v / norm for k, v in vec.items()}
        return vec

    def query_vec(self, text: str) -> Dict[str, float]:
        return self._vectorise(_tokenize(text))

    def cosine(self, q_vec: Dict[str, float], d_vec: Dict[str, float]) -> float:
        """Cosine similarity of two L2-normalised vectors."""
        # Both vectors are already unit-length after _vectorise
        return sum(q_vec.get(t, 0.0) * d_vec.get(t, 0.0) for t in q_vec)


class RetrievalService:
    def __init__(self) -> None:
        self.questions: List[Dict[str, Any]] = []
        self._initialized = False
        self._tfidf = _TFIDF()

    async def initialize(self) -> None:
        if self._initialized:
            return

        logger.info("Loading Q&A dataset from %s", settings.QA_DATASET_PATH)
        with open(settings.QA_DATASET_PATH, encoding="utf-8") as fh:
            dataset = json.load(fh)
        self.questions = dataset["questions"]

        # Fit TF-IDF over question + reference answer for rich semantic matching
        corpus = [
            f"{q['question']} {q['reference_answer']}"
            for q in self.questions
        ]
        self._tfidf.fit(corpus)

        self._initialized = True
        logger.info(
            "Retrieval service ready (%d questions, TF-IDF cosine)",
            len(self.questions),
        )

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def search(
        self,
        query: str,
        k: int = 3,
        exclude_ids: Optional[List[str]] = None,
    ) -> List[Tuple[Dict[str, Any], float]]:
        """Return top-k (question_dict, cosine_similarity) pairs for a query."""
        if not self._initialized:
            raise RuntimeError("RetrievalService not initialized")

        exclude = set(exclude_ids or [])
        q_vec = self._tfidf.query_vec(query)

        scored: List[Tuple[Dict[str, Any], float]] = []
        for q, d_vec in zip(self.questions, self._tfidf._corpus_vecs):
            if q["id"] in exclude:
                continue
            score = self._tfidf.cosine(q_vec, d_vec)
            scored.append((q, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:k]

    def get_reference_for_question(self, question_id: str) -> Optional[Dict[str, Any]]:
        """Exact lookup by question ID — O(n), always correct."""
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

        target_cats = set(
            categories or role_category_map.get(role, role_category_map["general"])
        )

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
