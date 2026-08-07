# app/routers/team_roster.py
"""
Team Roster — on-call agents and capacity, backing Workbench assignment.
"""

import logging
from collections import Counter

from fastapi import APIRouter, HTTPException

from ..core.supabase import SupabaseError, sb_get

log = logging.getLogger(__name__)

router = APIRouter(prefix="/team-roster", tags=["Team Roster"])


@router.get("")
async def list_roster():
    try:
        agents = await sb_get("team_roster", {"order": "team.asc,agent_name.asc"})
        open_tasks = await sb_get(
            "workbench_tasks",
            {"status": "eq.open", "select": "assigned_to"},
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")

    load_by_assignee = Counter(t["assigned_to"] for t in open_tasks if t.get("assigned_to"))

    for agent in agents:
        key = agent.get("agent_email") or agent.get("agent_name")
        agent["current_load"] = load_by_assignee.get(key, 0)

    return {"agents": agents, "count": len(agents)}
