# app/routers/workbench.py
"""
Workbench — the human-in-the-loop exception queue.

Backed by Supabase `workbench_tasks`. NOT the template's own Postgres.
Status values are constrained by `workbench_status_chk`:
open / approved / modified / rejected / resolved — there is no "pending".
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.supabase import SupabaseError, sb_get, sb_get_one, sb_patch

log = logging.getLogger(__name__)

router = APIRouter(prefix="/workbench", tags=["Workbench"])

DECISION_TO_STATUS = {
    "approve": "approved",
    "edit": "modified",
    "reject": "rejected",
}


class DecideRequest(BaseModel):
    decision: str  # approve | edit | reject
    resolved_by: str | None = None
    notes: str | None = None


@router.get("")
async def list_tasks(status: str = "open", limit: int = 50):
    try:
        rows = await sb_get(
            "workbench_tasks",
            {
                "status": f"eq.{status}",
                "order": "created_at.desc",
                "limit": str(limit),
            },
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    return {"tasks": rows, "count": len(rows)}


@router.get("/{task_id}")
async def get_task(task_id: str):
    try:
        task = await sb_get_one("workbench_tasks", {"task_id": f"eq.{task_id}"})
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    if task is None:
        raise HTTPException(status_code=404, detail="Workbench task not found")
    return task


@router.patch("/{task_id}/decide")
async def decide_task(task_id: str, body: DecideRequest):
    if body.decision not in DECISION_TO_STATUS:
        raise HTTPException(
            status_code=400,
            detail=f"decision must be one of {list(DECISION_TO_STATUS)}",
        )

    try:
        existing = await sb_get_one("workbench_tasks", {"task_id": f"eq.{task_id}"})
        if existing is None:
            raise HTTPException(status_code=404, detail="Workbench task not found")

        updated = await sb_patch(
            "workbench_tasks",
            {"task_id": f"eq.{task_id}"},
            {
                "status": DECISION_TO_STATUS[body.decision],
                "human_decision": body.decision,
                "resolved_by": body.resolved_by or "dev-user",
                "decided_at": datetime.now(timezone.utc).isoformat(),
            },
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")

    if not updated:
        raise HTTPException(status_code=404, detail="Workbench task not found")
    return updated[0]
