# app/routers/triage_queue.py
"""
Triage Queue — tickets ranked and waiting to be released into a run.
Backed by Supabase `triage_queue`, written by the Triage operator.
"""

import logging

from fastapi import APIRouter, HTTPException

from ..core.supabase import SupabaseError, sb_get

log = logging.getLogger(__name__)

router = APIRouter(prefix="/triage-queue", tags=["Triage Queue"])


@router.get("")
async def list_queue(queue_status: str = "queued", limit: int = 100):
    try:
        rows = await sb_get(
            "triage_queue",
            {
                "queue_status": f"eq.{queue_status}",
                "order": "priority_score.desc",
                "limit": str(limit),
            },
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    return {"queue": rows, "count": len(rows)}
