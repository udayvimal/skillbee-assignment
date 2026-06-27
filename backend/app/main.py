"""
FastAPI application entry point.

Startup sequence:
1. Create SQLite tables
2. Build (or load from cache) the FAISS embedding index
3. Mount all routers

All heavy I/O (model loading, FAISS build) happens ONCE on startup
and stays in memory for the lifetime of the process — critical for
Render Free Tier's constrained resources.
"""

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .api.routes import interview, sessions, websocket
from .config import settings
from .database import init_db
from .services.retrieval_service import retrieval_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    t0 = time.monotonic()
    logger.info("=== TechMind AI — starting up ===")

    # Initialize DB schema
    await init_db()
    logger.info("Database initialized")

    # Build or load FAISS index (most expensive step; cached after first run)
    await retrieval_service.initialize()

    logger.info("Startup complete in %.2fs", time.monotonic() - t0)
    yield
    logger.info("=== TechMind AI — shutting down ===")


app = FastAPI(
    title="TechMind AI — Voice Interview Agent",
    description="AI-powered voice interview system with grounded evaluation",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    # Allow any localhost port in dev + Vercel in prod
    allow_origin_regex=r"http://localhost:\d+|https://.*\.vercel\.app",
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
API_PREFIX = "/api/v1"
app.include_router(sessions.router, prefix=API_PREFIX)
app.include_router(interview.router, prefix=API_PREFIX)
app.include_router(websocket.router)  # WS routes don't use prefix


@app.get("/health", tags=["health"])
async def health() -> dict:
    return {
        "status": "ok",
        "retrieval_ready": retrieval_service._initialized,
        "questions_loaded": len(retrieval_service.questions),
    }
