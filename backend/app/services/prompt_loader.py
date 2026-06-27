"""
Loads prompt templates from backend/app/prompts/*.md at module import time.

Prompts live in files — not in code — so they can be edited without touching
service logic. Each prompt file has exactly one responsibility.
"""

from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


@lru_cache(maxsize=None)
def load_prompt(name: str) -> str:
    """
    Load and cache a prompt from prompts/{name}.md.

    Cached via lru_cache so each file is read exactly once at startup.
    Raises FileNotFoundError if the prompt file does not exist.
    """
    path = PROMPTS_DIR / f"{name}.md"
    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found: {path}")
    return path.read_text(encoding="utf-8").strip()


# Pre-load all prompts at import time so startup surfaces missing files early
SYSTEM_PROMPT     = load_prompt("system_prompt")
INTERVIEW_PROMPT  = load_prompt("interview_prompt")
EVALUATION_PROMPT = load_prompt("evaluation_prompt")
FOLLOWUP_PROMPT   = load_prompt("followup_prompt")
TEACHING_PROMPT   = load_prompt("teaching_prompt")
FEEDBACK_PROMPT   = load_prompt("feedback_prompt")
