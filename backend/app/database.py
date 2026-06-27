import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, JSON, String, Text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False, future=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


class InterviewSessionDB(Base):
    __tablename__ = "interview_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    language = Column(String, default="en")
    difficulty = Column(String, default="medium")
    state = Column(String, default="IDLE")
    question_ids = Column(JSON, default=list)
    current_question_index = Column(Integer, default=0)
    total_questions = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InterviewAnswerDB(Base):
    __tablename__ = "interview_answers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False, index=True)
    question_id = Column(String, nullable=False)
    question_text = Column(Text, nullable=False)
    category = Column(String, nullable=True)
    answer_text = Column(Text, nullable=True)
    is_follow_up = Column(Integer, default=0)
    score = Column(Float, nullable=True)
    evaluation_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
