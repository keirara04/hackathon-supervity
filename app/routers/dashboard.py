# app/routers/dashboard.py
"""
Dashboard KPIs — computed live from run_log. No seeded numbers; if the
pipeline hasn't produced enough data for a metric yet (e.g. no resolved
tickets), that metric is reported as null rather than faked.
"""

import logging
from collections import Counter, defaultdict
from datetime import datetime

from fastapi import APIRouter, HTTPException

from ..core.supabase import SupabaseError, sb_get

log = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/kpis")
async def get_kpis(limit: int = 1000):
    try:
        runs = await sb_get(
            "run_log",
            {
                "select": "path,verdict,sla_state_before,mttr_minutes,entered_at,resolved_at,department,is_vip",
                "order": "entered_at.desc",
                "limit": str(limit),
            },
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")

    total = len(runs)
    path_counts = Counter(r.get("path") for r in runs)
    auto = path_counts.get("auto", 0)
    human = path_counts.get("human", 0)
    pending = path_counts.get("pending", 0)
    decided = auto + human
    auto_resolution_rate = round(100 * auto / decided, 1) if decided else None

    breached_at_intake = sum(1 for r in runs if r.get("sla_state_before") == "Breached")
    sla_compliance_pct = (
        round(100 * (total - breached_at_intake) / total, 1) if total else None
    )

    mttr_values = [r["mttr_minutes"] for r in runs if r.get("mttr_minutes") is not None]
    avg_mttr_minutes = (
        round(sum(mttr_values) / len(mttr_values), 1) if mttr_values else None
    )

    resolved_count = sum(1 for r in runs if r.get("resolved_at") is not None)

    vip_count = sum(1 for r in runs if r.get("is_vip"))

    volume_by_day = defaultdict(int)
    for r in runs:
        ts = r.get("entered_at")
        if not ts:
            continue
        day = ts[:10]
        volume_by_day[day] += 1
    trend = [{"date": d, "count": c} for d, c in sorted(volume_by_day.items())]

    dept_counts = Counter(r.get("department") for r in runs if r.get("department"))

    return {
        "total_tickets": total,
        "path_breakdown": {"auto": auto, "human": human, "pending": pending},
        "auto_resolution_rate_pct": auto_resolution_rate,
        "sla_compliance_pct_at_intake": sla_compliance_pct,
        "avg_mttr_minutes": avg_mttr_minutes,
        "resolved_count": resolved_count,
        "vip_ticket_count": vip_count,
        "volume_by_day": trend,
        "department_breakdown": dict(dept_counts),
        "computed_at": datetime.utcnow().isoformat(),
    }
