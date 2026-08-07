# app/routers/policies.py
"""
AI Policies — the governance layer.

Backed by a Supabase singleton row `policy_config` (id=1), not a list of
independent DSL rules like the template's demo Policy CRUD. Each column is
a named lever read fresh by the Auto operators on every run. Evaluations
are logged to `policy_eval_log` for audit.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.supabase import SupabaseError, sb_get, sb_get_one, sb_patch

log = logging.getLogger(__name__)

router = APIRouter(prefix="/policies", tags=["Policies"])

READ_ONLY_FIELDS = {"id", "updated_at", "updated_by"}

# Lever metadata — drives the frontend's schema-driven controls.
# New levers added to policy_config later only need an entry here.
LEVER_SCHEMA = [
    {
        "key": "vip_always_escalate",
        "label": "VIP tickets always escalate",
        "type": "boolean",
    },
    {
        "key": "min_kb_confidence",
        "label": "Minimum KB match confidence",
        "type": "number",
        "min": 0,
        "max": 1,
        "step": 0.05,
    },
    {
        "key": "min_auto_score",
        "label": "Minimum auto-resolution score",
        "type": "number",
        "min": 0,
        "max": 1,
        "step": 0.05,
    },
    {
        "key": "auto_eligible_departments",
        "label": "Departments eligible for auto-resolution",
        "type": "array",
    },
    {
        "key": "allowed_categories",
        "label": "Allowed ticket categories",
        "type": "array",
    },
    {
        "key": "change_required_components",
        "label": "Components requiring change approval",
        "type": "array",
    },
    {
        "key": "major_incident_threshold",
        "label": "Major incident cluster threshold",
        "type": "number",
        "min": 1,
        "step": 1,
    },
    {
        "key": "csat_escalate_below",
        "label": "Escalate if CSAT below",
        "type": "number",
        "min": 1,
        "max": 5,
        "step": 1,
    },
    {
        "key": "followup_minutes",
        "label": "Follow-up window (minutes)",
        "type": "number",
        "min": 1,
        "step": 1,
    },
    {"key": "fetch_per_batch", "label": "Tickets fetched per batch", "type": "text"},
    {
        "key": "escalation_email",
        "label": "Escalation notification email",
        "type": "text",
    },
    {
        "key": "assignment_routing",
        "label": "Component → assignee routing",
        "type": "object",
    },
]

VALID_KEYS = {lever["key"] for lever in LEVER_SCHEMA}


class PolicyUpdate(BaseModel):
    class Config:
        extra = "allow"


@router.get("/schema")
async def get_schema():
    return {"levers": LEVER_SCHEMA}


@router.get("")
async def get_policy():
    try:
        row = await sb_get_one("policy_config", {"id": "eq.1"})
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    if row is None:
        raise HTTPException(status_code=404, detail="policy_config row not found")
    return row


@router.patch("")
async def update_policy(body: PolicyUpdate):
    updates = body.model_dump(exclude_unset=True)
    unknown = set(updates) - VALID_KEYS
    if unknown:
        raise HTTPException(
            status_code=400, detail=f"Unknown policy keys: {sorted(unknown)}"
        )
    if not updates:
        raise HTTPException(status_code=400, detail="No policy fields provided")

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_by"] = "dev-user"

    try:
        rows = await sb_patch("policy_config", {"id": "eq.1"}, updates)
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    if not rows:
        raise HTTPException(status_code=404, detail="policy_config row not found")
    return rows[0]


@router.get("/log")
async def get_eval_log(limit: int = 50):
    try:
        rows = await sb_get(
            "policy_eval_log",
            {"order": "evaluated_at.desc", "limit": str(limit)},
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    return {"log": rows, "count": len(rows)}


@router.get("/audit")
async def get_audit(limit: int = 50):
    try:
        rows = await sb_get(
            "policy_audit",
            {"order": "changed_at.desc", "limit": str(limit)},
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")

    entries = []
    for row in rows:
        old = row.get("old_value") or {}
        new = row.get("new_value") or {}
        changes = []
        for key in VALID_KEYS:
            if old.get(key) != new.get(key):
                changes.append({"field": key, "from": old.get(key), "to": new.get(key)})
        entries.append({
            "id": row["id"],
            "changed_at": row["changed_at"],
            "changed_by": row.get("changed_by"),
            "changes": changes,
        })

    return {"entries": entries, "count": len(entries)}
