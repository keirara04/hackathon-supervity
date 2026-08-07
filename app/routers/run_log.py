# app/routers/run_log.py
"""
Run Log — the full pipeline ledger. Two views:
- /runs: per-run rollups from the v_run_metrics Supabase view (tickets
  processed, auto/human split, SLA risk before/after, avg MTTR).
- /tickets: the raw run_log rows, one per ticket, filterable.
"""

import logging

from fastapi import APIRouter, HTTPException

from ..core.supabase import SupabaseError, sb_get

log = logging.getLogger(__name__)

router = APIRouter(prefix="/run-log", tags=["Run Log"])


@router.get("/runs")
async def list_runs(limit: int = 50):
    try:
        rows = await sb_get(
            "v_run_metrics",
            {"order": "run_started_at.desc", "limit": str(limit)},
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    return {"runs": rows, "count": len(rows)}


@router.get("/tickets")
async def list_tickets(
    path: str | None = None,
    department: str | None = None,
    verdict: str | None = None,
    run_id: str | None = None,
    limit: int = 100,
):
    params: dict = {"order": "entered_at.desc", "limit": str(limit)}
    if path:
        params["path"] = f"eq.{path}"
    if department:
        params["department"] = f"eq.{department}"
    if verdict:
        params["verdict"] = f"eq.{verdict}"
    if run_id:
        params["run_id"] = f"eq.{run_id}"

    try:
        rows = await sb_get("run_log", params)
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    return {"tickets": rows, "count": len(rows)}
