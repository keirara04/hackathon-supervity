# app/routers/zendesk.py
"""
Live Zendesk ticket viewer + manual import into triage_queue.

Mirrors the exact query Amsyar's Sweep operator uses
(type:ticket status<solved -tags:aiden_processed), so what's shown here is
what Sweep would pick up. Import only ever writes Sweep-owned intake columns
(issue_key, issue_id, summary, channel, labels, priority_raw, reporter_raw,
created_src, due_date [+ queue_status/first_seen_at on first insert only]) —
never a Triage-derived column (department, is_vip, priority_score, rank,
cluster_key, ...), so re-importing an already-triaged ticket can't clobber
real scoring, exactly like a real Sweep re-run wouldn't.
"""

import json
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.supabase import SupabaseError, sb_get, sb_patch, sb_upsert
from ..core.zendesk import ZENDESK_SUBDOMAIN, get_zendesk_token, zendesk_configured

log = logging.getLogger(__name__)

router = APIRouter(prefix="/zendesk", tags=["Zendesk"])

SWEEP_QUERY = "type:ticket status<solved -tags:aiden_processed"


async def _fetch_tickets() -> tuple[list[dict], dict[str, dict]]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        token = await get_zendesk_token(client)
        if not token:
            raise HTTPException(status_code=503, detail="Zendesk token exchange failed")
        headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

        search_resp = await client.get(
            f"https://{ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/search.json",
            params={"query": SWEEP_QUERY},
            headers=headers,
        )
        if search_resp.status_code >= 300:
            raise HTTPException(status_code=502, detail=f"Zendesk search failed: HTTP {search_resp.status_code}")
        results = search_resp.json().get("results", [])

        requester_ids = sorted({str(t["requester_id"]) for t in results if t.get("requester_id")})
        identities: dict[str, dict] = {}
        if requester_ids:
            users_resp = await client.get(
                f"https://{ZENDESK_SUBDOMAIN}.zendesk.com/api/v2/users/show_many.json",
                params={"ids": ",".join(requester_ids)},
                headers=headers,
            )
            if users_resp.status_code < 300:
                for u in users_resp.json().get("users", []):
                    identities[str(u["id"])] = {"name": u.get("name"), "email": u.get("email")}

    return results, identities


@router.get("/tickets")
async def list_tickets():
    if not zendesk_configured():
        raise HTTPException(status_code=503, detail="Zendesk credentials not set in backend .env")

    results, identities = await _fetch_tickets()
    issue_keys = [str(t["id"]) for t in results]

    queued_map: dict[str, str] = {}
    if issue_keys:
        try:
            queued_rows = await sb_get(
                "triage_queue",
                {"issue_key": f"in.({','.join(issue_keys)})", "select": "issue_key,queue_status"},
            )
            queued_map = {r["issue_key"]: r.get("queue_status") for r in queued_rows}
        except SupabaseError as e:
            raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")

    tickets = []
    for t in results:
        issue_key = str(t["id"])
        req = identities.get(str(t.get("requester_id")), {})
        tickets.append({
            "ticket_id": t["id"],
            "issue_key": issue_key,
            "external_id": t.get("external_id"),
            "subject": t.get("subject"),
            "description": t.get("description"),
            "priority": t.get("priority"),
            "status": t.get("status"),
            "tags": t.get("tags", []),
            "created_at": t.get("created_at"),
            "due_at": t.get("due_at"),
            "requester_name": req.get("name"),
            "requester_email": req.get("email"),
            "already_queued": issue_key in queued_map,
            "queue_status": queued_map.get(issue_key),
        })

    return {"tickets": tickets, "count": len(tickets)}


class TicketOverride(BaseModel):
    ticket_id: int
    summary: str | None = None
    priority_raw: str | None = None
    due_date: str | None = None


class ImportRequest(BaseModel):
    tickets: list[TicketOverride]


@router.post("/import")
async def import_tickets(body: ImportRequest):
    if not zendesk_configured():
        raise HTTPException(status_code=503, detail="Zendesk credentials not set in backend .env")
    if not body.tickets:
        raise HTTPException(status_code=400, detail="No tickets provided")

    results, identities = await _fetch_tickets()
    by_id = {t["id"]: t for t in results}

    requested_keys = [str(o.ticket_id) for o in body.tickets]
    try:
        existing_rows = await sb_get(
            "triage_queue",
            {"issue_key": f"in.({','.join(requested_keys)})", "select": "issue_key"},
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    existing_keys = {r["issue_key"] for r in existing_rows}

    outcomes = []
    for override in body.tickets:
        ticket = by_id.get(override.ticket_id)
        issue_key = str(override.ticket_id)

        if ticket is None:
            outcomes.append({
                "issue_key": issue_key,
                "action": "error",
                "detail": "Ticket not found in current unresolved Zendesk results (may already be solved)",
            })
            continue

        req = identities.get(str(ticket.get("requester_id")), {})
        reporter_raw = json.dumps({"name": req.get("name"), "email": req.get("email")})

        intake_fields = {
            "issue_key": issue_key,
            "issue_id": ticket["id"],
            "summary": override.summary or ticket.get("subject"),
            "channel": "zendesk",
            "labels": ",".join(ticket.get("tags", [])),
            "priority_raw": override.priority_raw or ticket.get("priority"),
            "reporter_raw": reporter_raw,
            "created_src": ticket.get("created_at"),
            "due_date": override.due_date or ticket.get("due_at"),
        }

        try:
            if issue_key in existing_keys:
                await sb_patch("triage_queue", {"issue_key": f"eq.{issue_key}"}, intake_fields)
                outcomes.append({"issue_key": issue_key, "action": "refreshed"})
            else:
                intake_fields["queue_status"] = "queued"
                intake_fields["first_seen_at"] = datetime.now(timezone.utc).isoformat()
                await sb_upsert("triage_queue", intake_fields, on_conflict="issue_key")
                outcomes.append({"issue_key": issue_key, "action": "inserted"})
        except SupabaseError as e:
            outcomes.append({"issue_key": issue_key, "action": "error", "detail": e.detail})

    return {"results": outcomes}
