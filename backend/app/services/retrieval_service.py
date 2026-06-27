"""
Retrieval service using fastembed (ONNX-based, no PyTorch dependency)
and FAISS for vector similarity search.

Embeddings are built once on first startup and cached to disk so
subsequent restarts skip the heavy embedding step entirely.
"""

import json
import logging
import random
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import faiss
import numpy as np

from ..config import settings

logger = logging.getLogger(__name__)


class RetrievalService:
    def __init__(self) -> None:
        self.index: Optional[faiss.IndexFlatIP] = None
        self.questions: List[Dict[str, Any]] = []
        self._corpus_texts: List[str] = []
        self._initialized = False

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

    async def initialize(self) -> None:
        if self._initialized:
            return

        logger.info("Loading Q&A dataset from %s", settings.QA_DATASET_PATH)
        with open(settings.QA_DATASET_PATH, encoding="utf-8") as fh:
            dataset = json.load(fh)
        self.questions = dataset["questions"]

        # Corpus: question + reference answer for rich semantic matching
        self._corpus_texts = [
            f"{q['question']} {q['reference_answer']}" for q in self.questions
        ]

        cache_path = Path(settings.EMBEDDINGS_CACHE_PATH)
        index_path = Path(settings.FAISS_INDEX_PATH)

        if cache_path.exists() and index_path.exists():
            logger.info("Loading cached FAISS index and embeddings")
            data = np.load(str(cache_path))
            embeddings = data["embeddings"]
            self.index = faiss.read_index(str(index_path))
        else:
            logger.info("Building embeddings with %s (first-time only)", settings.EMBEDDING_MODEL)
            embeddings = self._build_embeddings(self._corpus_texts)
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            np.savez(str(cache_path), embeddings=embeddings)
            faiss.write_index(self.index, str(index_path))
            logger.info("Embeddings and index cached to disk")

        self._initialized = True
        logger.info("Retrieval service ready (%d questions indexed)", len(self.questions))

    def _build_embeddings(self, texts: List[str]) -> np.ndarray:
        """Build and normalise embeddings; also constructs the FAISS index."""
        from fastembed import TextEmbedding  # lazy import to control memory timing

        model = TextEmbedding(model_name=settings.EMBEDDING_MODEL)
        raw = np.array(list(model.embed(texts)), dtype=np.float32)
        del model  # free ONNX session memory

        norms = np.linalg.norm(raw, axis=1, keepdims=True)
        embeddings = raw / np.maximum(norms, 1e-9)

        dim = embeddings.shape[1]
        self.index = faiss.IndexFlatIP(dim)  # cosine similarity after L2-norm
        self.index.add(embeddings)
        return embeddings

    def _embed_query(self, text: str) -> np.ndarray:
        """Embed a single query at evaluation time."""
        from fastembed import TextEmbedding

        model = TextEmbedding(model_name=settings.EMBEDDING_MODEL)
        raw = np.array(list(model.embed([text])), dtype=np.float32)
        del model
        norm = np.linalg.norm(raw, axis=1, keepdims=True)
        return raw / np.maximum(norm, 1e-9)

    # ------------------------------------------------------------------
    # Public interface
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

        query_emb = self._embed_query(query)
        scores, indices = self.index.search(query_emb, min(k * 3, len(self.questions)))

        exclude = set(exclude_ids or [])
        results: List[Tuple[Dict[str, Any], float]] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            q = self.questions[int(idx)]
            if q["id"] in exclude:
                continue
            results.append((q, float(score)))
            if len(results) >= k:
                break

        return results

    def get_reference_for_question(self, question_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a question by ID (direct lookup for the current interview question)."""
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
        """
        Select a diverse, role-appropriate set of questions for an interview.
        Always includes 1-2 behavioral questions regardless of role.
        """
        role_category_map: Dict[str, List[str]] = {
            "frontend":      ["JavaScript", "TypeScript", "React", "Databases", "Behavioral"],
            "backend":       ["Python", "System Design", "Databases", "API Design", "Behavioral"],
            "fullstack":     ["JavaScript", "Python", "React", "System Design", "Databases", "Behavioral"],
            "data_engineer": ["Python", "Databases", "Data Structures", "System Design", "Behavioral"],
            "devops":        ["System Design", "Python", "Databases", "API Design", "Behavioral"],
            "general":       list({q["category"] for q in self.questions}),
        }

        target_cats = set(categories or role_category_map.get(role, role_category_map["general"]))

        # Prefer exact difficulty; fall back to any difficulty if not enough
        primary = [
            q for q in self.questions
            if q["difficulty"] == difficulty and q["category"] in target_cats
        ]
        fallback = [
            q for q in self.questions
            if q["difficulty"] != difficulty and q["category"] in target_cats
        ]
        pool = primary + fallback

        # Ensure behavioral coverage
        behavioral = [q for q in pool if q["category"] == "Behavioral"]
        technical = [q for q in pool if q["category"] != "Behavioral"]

        random.shuffle(behavioral)
        random.shuffle(technical)

        selected: List[Dict[str, Any]] = []
        # Pick 1-2 behavioral questions
        for q in behavioral[:2]:
            selected.append(q)

        # Fill remaining slots with technical, max 2 per category
        cat_counts: Dict[str, int] = {}
        for q in technical:
            cat = q["category"]
            if cat_counts.get(cat, 0) < 2 and len(selected) < count:
                selected.append(q)
                cat_counts[cat] = cat_counts.get(cat, 0) + 1

        random.shuffle(selected)
        return selected[:count]


retrieval_service = RetrievalService()
