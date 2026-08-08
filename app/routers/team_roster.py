# app/routers/team_roster.py
"""
Team Roster — on-call agents/capacity, and full CRUD over Supabase
`team_roster`. Not written by any Auto operator (only read, for capacity
lookups), so CRUD here can't corrupt live pipeline state — same reasoning
as Users Directory.
"""

import logging
from collections import Counter

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.supabase import (
    SupabaseError,
    sb_delete,
    sb_get,
    sb_get_one,
    sb_patch,
    sb_post,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/team-roster", tags=["Team Roster"])


class AgentCreate(BaseModel):
    agent_name: str
    agent_email: str | None = None
    team: str | None = None
    component: str | None = None
    shift: str | None = None
    on_call: bool = False
    open_ticket_cap: int = 10
    active: bool = True
    role: str | None = None
    assignment_group: str | None = None
    region: str | None = None


class AgentUpdate(BaseModel):
    agent_name: str | None = None
    agent_email: str | None = None
    team: str | None = None
    component: str | None = None
    shift: str | None = None
    on_call: bool | None = None
    open_ticket_cap: int | None = None
    active: bool | None = None
    role: str | None = None
    assignment_group: str | None = None
    region: str | None = None


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

    load_by_assignee = Counter(
        t["assigned_to"] for t in open_tasks if t.get("assigned_to")
    )

    for agent in agents:
        key = agent.get("agent_email") or agent.get("agent_name")
        agent["current_load"] = load_by_assignee.get(key, 0)

    return {"agents": agents, "count": len(agents)}


@router.post("")
async def create_agent(body: AgentCreate):
    try:
        rows = await sb_post("team_roster", body.model_dump())
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    return rows[0]


@router.patch("/{agent_id}")
async def update_agent(agent_id: int, body: AgentUpdate):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided")
    try:
        rows = await sb_patch("team_roster", {"id": f"eq.{agent_id}"}, updates)
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    if not rows:
        raise HTTPException(status_code=404, detail="Agent not found")
    return rows[0]


@router.delete("/{agent_id}")
async def delete_agent(agent_id: int):
    try:
        existing = await sb_get_one("team_roster", {"id": f"eq.{agent_id}"})
        if existing is None:
            raise HTTPException(status_code=404, detail="Agent not found")
        await sb_delete("team_roster", {"id": f"eq.{agent_id}"})
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    return {"status": "deleted", "id": agent_id}
