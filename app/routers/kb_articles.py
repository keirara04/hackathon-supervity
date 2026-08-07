# app/routers/kb_articles.py
"""
Knowledge Base — the article set the Diagnose & Correlate operator matches
tickets against. `x_auto_safe` gates whether a matched article can be used
for auto-remediation (see Score & Decide operator + AI Policies min_kb_confidence).
"""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.supabase import SupabaseError, sb_get, sb_get_one, sb_patch

log = logging.getLogger(__name__)

router = APIRouter(prefix="/kb-articles", tags=["Knowledge Base"])


class KBUpdate(BaseModel):
    x_auto_safe: bool


@router.get("")
async def list_articles(
    category: str | None = None,
    x_auto_safe: bool | None = None,
    action_type: str | None = None,
):
    params: dict = {"order": "article_id.asc"}
    if category:
        params["category"] = f"eq.{category}"
    if x_auto_safe is not None:
        params["x_auto_safe"] = f"eq.{str(x_auto_safe).lower()}"
    if action_type:
        params["action_type"] = f"eq.{action_type}"

    try:
        rows = await sb_get("kb_articles", params)
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    return {"articles": rows, "count": len(rows)}


@router.get("/{article_id}")
async def get_article(article_id: str):
    try:
        row = await sb_get_one("kb_articles", {"article_id": f"eq.{article_id}"})
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    if row is None:
        raise HTTPException(status_code=404, detail="KB article not found")
    return row


@router.patch("/{article_id}")
async def update_article(article_id: str, body: KBUpdate):
    try:
        rows = await sb_patch(
            "kb_articles",
            {"article_id": f"eq.{article_id}"},
            {"x_auto_safe": body.x_auto_safe},
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    if not rows:
        raise HTTPException(status_code=404, detail="KB article not found")
    return rows[0]
