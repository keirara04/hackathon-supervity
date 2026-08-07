# app/routers/incidents.py
"""
Major-Incident detection — built on the Command Center side since Amsyar's
Major-Incident Commander operator isn't built yet. Groups run_log by
cluster_key (already written by the Triage operator), flags clusters at or
above policy_config.major_incident_threshold, and declares/links incidents
in the existing (empty) `incidents` table — no schema changes needed.
"""

import logging

from fastapi import APIRouter, HTTPException

from ..core.supabase import SupabaseError, sb_get, sb_get_one, sb_patch, sb_post

log = logging.getLogger(__name__)

router = APIRouter(prefix="/incidents", tags=["Incidents"])


async def _cluster_sizes() -> dict[str, dict]:
    rows = await sb_get(
        "run_log",
        {"select": "ticket_id,cluster_key,resolved_at", "cluster_key": "not.is.null", "limit": "1000"},
    )
    clusters: dict[str, dict] = {}
    for r in rows:
        key = r["cluster_key"]
        entry = clusters.setdefault(key, {"cluster_key": key, "total": 0, "active": 0, "ticket_ids": []})
        entry["total"] += 1
        entry["ticket_ids"].append(r["ticket_id"])
        if r.get("resolved_at") is None:
            entry["active"] += 1
    return clusters


@router.get("")
async def list_incidents():
    try:
        clusters = await _cluster_sizes()
        policy = await sb_get_one("policy_config", {"id": "eq.1"})
        declared = await sb_get("incidents", {"order": "opened_at.desc", "limit": "100"})
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")

    threshold = (policy or {}).get("major_incident_threshold", 5)
    cluster_list = sorted(clusters.values(), key=lambda c: c["active"], reverse=True)
    for c in cluster_list:
        c["at_threshold"] = c["active"] >= threshold

    return {"clusters": cluster_list, "threshold": threshold, "incidents": declared}


@router.post("/detect")
async def detect_incidents():
    try:
        clusters = await _cluster_sizes()
        policy = await sb_get_one("policy_config", {"id": "eq.1"})
        existing_open = await sb_get("incidents", {"status": "eq.open", "limit": "200"})
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")

    threshold = (policy or {}).get("major_incident_threshold", 5)
    open_titles = {row["title"]: row for row in existing_open if row.get("title")}

    results = []
    for cluster_key, info in clusters.items():
        if info["active"] < threshold:
            continue

        existing = open_titles.get(cluster_key)
        if existing:
            incident_id = existing["id"]
            created = False
        else:
            severity = "critical" if info["active"] >= threshold * 2 else "high"
            try:
                new_rows = await sb_post(
                    "incidents",
                    {
                        "incident_id": f"INC-{cluster_key}",
                        "title": cluster_key,
                        "root_cause": (
                            f"{info['active']} related tickets sharing cluster "
                            f"'{cluster_key}' are currently unresolved."
                        ),
                        "severity": severity,
                        "status": "open",
                        "child_count": info["active"],
                    },
                )
            except SupabaseError as e:
                results.append({"cluster_key": cluster_key, "error": e.detail})
                continue
            incident_id = new_rows[0]["id"]
            created = True

        try:
            await sb_patch(
                "run_log",
                {"cluster_key": f"eq.{cluster_key}", "resolved_at": "is.null"},
                {"parent_incident_id": incident_id},
            )
        except SupabaseError as e:
            results.append(
                {
                    "cluster_key": cluster_key,
                    "incident_id": incident_id,
                    "created": created,
                    "link_error": e.detail,
                }
            )
            continue

        results.append({
            "cluster_key": cluster_key,
            "incident_id": incident_id,
            "created": created,
            "linked_tickets": info["active"],
        })

    return {"threshold": threshold, "detected": results, "count": len(results)}
