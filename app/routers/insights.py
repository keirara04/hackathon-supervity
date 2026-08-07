# app/routers/insights.py
"""
AI Insights — computed live from policy_eval_log + run_log, not seeded demo
data. Deterministic aggregation for now; each insight carries a severity
and a concrete action path per the Command Center Guide.
"""

import logging
from collections import Counter, defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

from ..core.supabase import SupabaseError, sb_get

log = logging.getLogger(__name__)

router = APIRouter(prefix="/insights", tags=["Insights"])


def _pct(n: int, total: int) -> float:
    return round(100 * n / total, 1) if total else 0.0


@router.get("")
async def get_insights(limit: int = 500):
    try:
        evals = await sb_get(
            "policy_eval_log",
            {"select": "verdict,policy_hits,reason,inputs", "order": "evaluated_at.desc", "limit": str(limit)},
        )
        runs = await sb_get(
            "run_log",
            {
                "select": "path,mttr_minutes,sla_state_before,department,category,entered_at",
                "order": "entered_at.desc",
                "limit": str(limit),
            },
        )
        overrides = await sb_get(
            "workbench_tasks",
            {"select": "status,human_decision,context", "status": "in.(rejected,modified)", "limit": str(limit)},
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")

    insights = []
    total_evals = len(evals)

    if total_evals:
        hit_counts = Counter()
        for row in evals:
            for hit in row.get("policy_hits") or []:
                hit_counts[hit] += 1

        vip_hits = hit_counts.get("vip_always_escalate", 0)
        vip_pct = _pct(vip_hits, total_evals)
        if vip_hits > 0:
            insights.append({
                "type": "recommendation",
                "severity": "warning" if vip_pct >= 30 else "info",
                "title": "VIP escalation is driving a large share of human routing",
                "description": (
                    f"{vip_hits} of {total_evals} policy evaluations ({vip_pct}%) routed to a human "
                    f"purely because vip_always_escalate is ON, independent of KB confidence or auto-score. "
                    f"Consider a VIP fast-track policy (auto-resolve high-confidence VIP tickets, "
                    f"escalate only low-confidence ones) instead of a blanket escalation."
                ),
                "action": "Review vip_always_escalate policy — flip off and re-run to measure auto-resolution lift.",
                "confidence": vip_pct / 100,
            })

        score_gate_hits = hit_counts.get("auto_score_below_threshold", 0)
        if score_gate_hits > 0:
            insights.append({
                "type": "pattern",
                "severity": "info",
                "title": "Auto-score threshold is blocking near-miss tickets",
                "description": (
                    f"{score_gate_hits} of {total_evals} evaluations ({_pct(score_gate_hits, total_evals)}%) "
                    f"were routed to a human solely for falling just under min_auto_score."
                ),
                "action": (
                    "Inspect the actual auto_score values on these tickets — if most cluster "
                    "just below the threshold, consider lowering min_auto_score slightly."
                ),
                "confidence": 0.6,
            })

        kb_unsafe_hits = hit_counts.get("kb_not_auto_safe", 0)
        if kb_unsafe_hits > 0:
            insights.append({
                "type": "recommendation",
                "severity": "info",
                "title": "Recurring KB articles are not marked auto-safe",
                "description": (
                    f"{kb_unsafe_hits} evaluations ({_pct(kb_unsafe_hits, total_evals)}%) escalated because "
                    f"the matched KB article's x_auto_safe flag is false."
                ),
                "action": (
                    "Review the most-hit KB articles behind this — mark safe ones "
                    "as auto-safe to unlock auto-resolution."
                ),
                "confidence": 0.5,
            })

        dept_totals = Counter()
        dept_verdicts = Counter()
        for row in evals:
            dept = (row.get("inputs") or {}).get("department")
            if not dept:
                continue
            dept_totals[dept] += 1
            if row.get("verdict") == "auto":
                dept_verdicts[dept] += 1
        if dept_totals:
            best_dept, best_total = max(dept_totals.items(), key=lambda kv: kv[1])
            best_auto_pct = _pct(dept_verdicts.get(best_dept, 0), best_total)
            insights.append({
                "type": "pattern",
                "severity": "info",
                "title": f"{best_dept} has the highest evaluation volume",
                "description": (
                    f"{best_dept} accounts for {best_total} of {total_evals} evaluations "
                    f"({_pct(best_total, total_evals)}%), auto-resolving at {best_auto_pct}%."
                ),
                "action": (
                    "Compare auto-resolution rate across departments to spot where "
                    "policy tuning would have the most impact."
                ),
                "confidence": 0.7,
            })

    resolved_runs = [r for r in runs if r.get("mttr_minutes") is not None]
    if resolved_runs:
        avg_mttr = round(sum(r["mttr_minutes"] for r in resolved_runs) / len(resolved_runs), 1)
        insights.append({
            "type": "pattern",
            "severity": "info",
            "title": "Average time-to-resolution",
            "description": f"Across {len(resolved_runs)} resolved tickets, average MTTR is {avg_mttr} minutes.",
            "action": "Track this trend over time as a headline dashboard KPI.",
            "confidence": 0.8,
        })

    # Self-learning: when humans consistently override the AI for the same
    # policy-driven reason, suggest the concrete policy change that would fix it.
    MIN_OVERRIDE_SAMPLE = 3
    if len(overrides) >= MIN_OVERRIDE_SAMPLE:
        override_hit_counts = Counter()
        for row in overrides:
            for hit in (row.get("context") or {}).get("policy_hits") or []:
                override_hit_counts[hit] += 1

        SUGGESTED_PATCHES = {
            "vip_always_escalate": {"vip_always_escalate": False},
            "kb_not_auto_safe": None,  # no single safe lever — needs KB review, not a policy flip
            "auto_score_below_threshold": {"min_auto_score": 0.5},
        }
        if override_hit_counts:
            top_hit, top_count = override_hit_counts.most_common(1)[0]
            top_pct = _pct(top_count, len(overrides))
            patch = SUGGESTED_PATCHES.get(top_hit)
            if patch and top_pct >= 50:
                insights.append({
                    "type": "self_learning",
                    "severity": "warning",
                    "title": "Workbench overrides point to a specific policy fix",
                    "description": (
                        f"{top_count} of {len(overrides)} human overrides ({top_pct}%) trace back to the "
                        f"same policy trigger: '{top_hit}'. Humans are consistently disagreeing with what "
                        f"this policy setting forces the AI to do."
                    ),
                    "action": f"Apply the suggested change to {list(patch.keys())[0]}, or keep reviewing manually.",
                    "confidence": top_pct / 100,
                    "suggested_patch": patch,
                })

    # Forecast: simple moving-average projection from real ticket volume.
    volume_by_day: dict[str, int] = defaultdict(int)
    for r in runs:
        ts = r.get("entered_at")
        if ts:
            volume_by_day[ts[:10]] += 1
    sorted_days = sorted(volume_by_day.items())
    if len(sorted_days) >= 2:
        recent = sorted_days[-3:]
        avg_volume = round(sum(c for _, c in recent) / len(recent), 1)
        next_day = (datetime.fromisoformat(sorted_days[-1][0]) + timedelta(days=1)).strftime("%Y-%m-%d")
        insights.append({
            "type": "pattern",
            "severity": "info",
            "title": "Ticket volume forecast",
            "description": (
                f"Over the last {len(recent)} day(s) with data, average intake is {avg_volume} tickets/day. "
                f"At that pace, expect roughly {round(avg_volume)} tickets on {next_day}."
            ),
            "action": "Compare against team_roster on-call capacity to see if staffing covers projected volume.",
            "confidence": 0.5,
        })

    return {
        "insights": insights,
        "generated_from": {
            "policy_evaluations": total_evals,
            "run_log_rows": len(runs),
            "workbench_overrides": len(overrides),
        },
    }
