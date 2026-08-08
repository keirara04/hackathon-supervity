# app/core/openrouter.py
"""
Shared OpenRouter client — used by the AI Manager chat (app/routers/ai.py)
and AI Insights synthesis/diagnosis (app/routers/insights.py). One place for
the model/env config and the JSON-extraction helper, since the configured
model has no native tool-calling support (see module docstring history in
ai.py) and both consumers need the same "extract JSON from a possibly
fenced/prose-wrapped response" logic.
"""

import json
import os

import httpx
from fastapi import HTTPException

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.2-3b-instruct")


def openrouter_configured() -> bool:
    return bool(OPENROUTER_API_KEY)


async def call_openrouter(messages: list[dict]) -> str:
    if not OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=503, detail="OPENROUTER_API_KEY not configured on backend"
        )

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": OPENROUTER_MODEL,
                "messages": messages,
            },
        )
    if resp.status_code >= 300:
        raise HTTPException(
            status_code=502,
            detail=f"OpenRouter error {resp.status_code}: {resp.text[:500]}",
        )
    return resp.json()["choices"][0]["message"]["content"] or ""


def extract_json(text: str) -> dict | None:
    """Best-effort JSON extraction — small models sometimes wrap JSON in
    prose or markdown fences despite instructions."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
