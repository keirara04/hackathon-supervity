# app/routers/insights.py
"""
AI Insights — computed live from policy_eval_log + run_log, not seeded demo
data. Deterministic aggregation is the reliable base layer; one additional
insight per load is LLM-synthesized (OpenRouter) from the same aggregated
stats, correlating signals a single per-metric rule can't. A separate
on-demand /diagnose endpoint lets the frontend ask for a deeper, grounded
LLM diagnosis of any one insight — only called when a user clicks for it,
not precomputed for every insight.
"""

import asyncio
import json
import logging
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.openrouter import call_openrouter, extract_json, openrouter_configured
from ..core.supabase import SupabaseError, sb_get

log = logging.getLogger(__name__)

router = APIRouter(prefix="/insights", tags=["Insights"])

# Single-entry TTL cache for the AI-synthesized insight — this is a
# single-tenant admin dashboard, so one global slot is enough. Avoids paying
# OpenRouter latency on every page load/refresh within the window.
_SYNTHESIS_CACHE_TTL = 60.0
_synthesis_cache: dict | None = None
_synthesis_cache_ts: float = 0.0


def _pct(n: int, total: int) -> float:
    return round(100 * n / total, 1) if total else 0.0


async def _fetch_source_rows(limit: int = 500):
    try:
        evals, runs, overrides = await asyncio.gather(
            sb_get(
                "policy_eval_log",
                {
                    "select": "verdict,policy_hits,reason,inputs",
                    "order": "evaluated_at.desc",
                    "limit": str(limit),
                },
            ),
            sb_get(
                "run_log",
                {
                    "select": "path,mttr_minutes,sla_state_before,department,category,entered_at",
                    "order": "entered_at.desc",
                    "limit": str(limit),
                },
            ),
            sb_get(
                "workbench_tasks",
                {
                    "select": "status,human_decision,context",
                    "status": "in.(rejected,modified)",
                    "limit": str(limit),
                },
            ),
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    return evals, runs, overrides


@router.get("")
async def get_insights(limit: int = 500):
    evals, runs, overrides = await _fetch_source_rows(limit)

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
            insights.append(
                {
                    "type": "recommendation",
                    "severity": "warning" if vip_pct >= 30 else "info",
                    "title": "VIP escalation is driving a large share of human routing",
                    "description": (
                        f"{vip_hits} of {total_evals} policy evaluations ({vip_pct}%) routed to a human "
                        f"purely because vip_always_escalate is ON, independent of KB confidence or auto-score. "
                        f"Consider a VIP fast-track policy (auto-resolve high-confidence VIP tickets, "
                        f"escalate only low-confidence ones) instead of a blanket escalation."
                    ),
                    "action": (
                        "Review vip_always_escalate policy — flip off and re-run "
                        "to measure auto-resolution lift."
                    ),
                    "confidence": vip_pct / 100,
                    "route": "/ai/policies?highlight=vip_always_escalate",
                    "guide": (
                        "Consider a VIP fast-track instead of a blanket escalation: turn off "
                        "vip_always_escalate so high-confidence VIP tickets can auto-resolve, "
                        "and rely on the auto-score/KB-safety gates to still catch low-confidence "
                        "ones for human review."
                    ),
                }
            )

        score_gate_hits = hit_counts.get("auto_score_below_threshold", 0)
        if score_gate_hits > 0:
            insights.append(
                {
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
                    "route": "/ai/policies?highlight=min_auto_score",
                    "guide": (
                        "Check where these near-miss scores actually cluster before changing "
                        "anything — if most sit just under the current min_auto_score, lower it "
                        "slightly and re-run to see the effect on auto-resolution rate."
                    ),
                }
            )

        kb_unsafe_hits = hit_counts.get("kb_not_auto_safe", 0)
        if kb_unsafe_hits > 0:
            insights.append(
                {
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
                    "route": "/knowledge-base",
                    "guide": (
                        "Go through the KB articles behind these escalations and check their "
                        "x_auto_safe flag — for the ones where auto-resolution is genuinely safe, "
                        "mark them auto-safe so matching tickets stop escalating unnecessarily."
                    ),
                }
            )

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
            insights.append(
                {
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
                    "route": None,
                    "guide": None,
                }
            )

    resolved_runs = [r for r in runs if r.get("mttr_minutes") is not None]
    if resolved_runs:
        avg_mttr = round(
            sum(r["mttr_minutes"] for r in resolved_runs) / len(resolved_runs), 1
        )
        insights.append(
            {
                "type": "pattern",
                "severity": "info",
                "title": "Average time-to-resolution",
                "description": f"Across {len(resolved_runs)} resolved tickets, average MTTR is {avg_mttr} minutes.",
                "action": "Track this trend over time as a headline dashboard KPI.",
                "confidence": 0.8,
                "route": None,
                "guide": None,
            }
        )

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
                patch_key = list(patch.keys())[0]
                insights.append(
                    {
                        "type": "self_learning",
                        "severity": "warning",
                        "title": "Workbench overrides point to a specific policy fix",
                        "description": (
                            f"{top_count} of {len(overrides)} human overrides ({top_pct}%) trace back to the "
                            f"same policy trigger: '{top_hit}'. Humans are consistently disagreeing with what "
                            f"this policy setting forces the AI to do."
                        ),
                        "action": f"Apply the suggested change to {patch_key}, or keep reviewing manually.",
                        "confidence": top_pct / 100,
                        "suggested_patch": patch,
                        "route": f"/ai/policies?highlight={patch_key}",
                        "guide": (
                            f"Humans keep overriding '{top_hit}' — the suggested fix is "
                            f"{patch_key} = {patch[patch_key]!r}. Review it here and apply if it "
                            f"matches what you're seeing in the override history."
                        ),
                    }
                )

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
        next_day = (
            datetime.fromisoformat(sorted_days[-1][0]) + timedelta(days=1)
        ).strftime("%Y-%m-%d")
        insights.append(
            {
                "type": "pattern",
                "severity": "info",
                "title": "Ticket volume forecast",
                "description": (
                    f"Over the last {len(recent)} day(s) with data, average intake is {avg_volume} tickets/day. "
                    f"At that pace, expect roughly {round(avg_volume)} tickets on {next_day}."
                ),
                "action": "Compare against team_roster on-call capacity to see if staffing covers projected volume.",
                "confidence": 0.5,
                "route": "/team-roster",
                "guide": (
                    f"Projected volume is roughly {round(avg_volume)} tickets on {next_day}. "
                    "Check on-call capacity here against that number before it hits."
                ),
            }
        )

    return {
        "insights": insights,
        "generated_from": {
            "policy_evaluations": total_evals,
            "run_log_rows": len(runs),
            "workbench_overrides": len(overrides),
        },
    }


@router.get("/synthesis")
async def get_synthesis_insight(force: bool = False):
    """
    One LLM-correlated insight from the same aggregated stats as the
    deterministic insights above, catching cross-signal patterns no single
    per-metric rule can. Split from GET /insights so the fast, deterministic
    page load never waits on OpenRouter. Cached for _SYNTHESIS_CACHE_TTL
    seconds since repeated page loads/refreshes shouldn't re-pay LLM latency.
    Returns {"insight": null} — never a fabricated insight — if OpenRouter
    isn't configured, times out, or errors.
    """
    global _synthesis_cache, _synthesis_cache_ts

    if (
        not force
        and _synthesis_cache is not None
        and (time.monotonic() - _synthesis_cache_ts) < _SYNTHESIS_CACHE_TTL
    ):
        return {"insight": _synthesis_cache, "cached": True}

    if not openrouter_configured():
        return {"insight": None, "cached": False}

    evals, runs, overrides = await _fetch_source_rows()
    total_evals = len(evals)
    if not total_evals:
        return {"insight": None, "cached": False}

    hit_counts = Counter()
    for row in evals:
        for hit in row.get("policy_hits") or []:
            hit_counts[hit] += 1

    dept_totals = Counter()
    dept_verdicts = Counter()
    for row in evals:
        dept = (row.get("inputs") or {}).get("department")
        if not dept:
            continue
        dept_totals[dept] += 1
        if row.get("verdict") == "auto":
            dept_verdicts[dept] += 1

    resolved_runs = [r for r in runs if r.get("mttr_minutes") is not None]
    avg_mttr = (
        round(sum(r["mttr_minutes"] for r in resolved_runs) / len(resolved_runs), 1)
        if resolved_runs
        else None
    )

    MIN_OVERRIDE_SAMPLE = 3
    override_hit_counts = Counter()
    for row in overrides:
        for hit in (row.get("context") or {}).get("policy_hits") or []:
            override_hit_counts[hit] += 1

    volume_by_day: dict[str, int] = defaultdict(int)
    for r in runs:
        ts = r.get("entered_at")
        if ts:
            volume_by_day[ts[:10]] += 1
    sorted_days = sorted(volume_by_day.items())

    stats_summary = {
        "total_policy_evaluations": total_evals,
        "policy_hit_counts": dict(hit_counts),
        "department_totals": dict(dept_totals),
        "department_auto_verdicts": dict(dept_verdicts),
        "resolved_ticket_count": len(resolved_runs),
        "avg_mttr_minutes": avg_mttr,
        "workbench_override_count": len(overrides),
        "top_override_hit": (
            override_hit_counts.most_common(1)[0]
            if len(overrides) >= MIN_OVERRIDE_SAMPLE and override_hit_counts
            else None
        ),
        "recent_daily_volume": dict(sorted_days[-7:]) if sorted_days else {},
    }
    synth_messages = [
        {
            "role": "system",
            "content": (
                "You are an operations analyst for a customer-support automation "
                "pipeline. You will be given real aggregated statistics (JSON). "
                "Correlate at least two of the given signals into ONE narrative "
                "insight that a single per-metric rule would miss (e.g. a policy "
                "hit combined with a department's low auto-rate, or override "
                "patterns combined with volume forecast). Do NOT invent any "
                "numbers, tickets, or facts not present in the given stats. "
                "Also pick the ONE page most relevant to acting on this insight, from exactly "
                'these options: "policies" (policy/routing levers), "knowledge-base" '
                '(KB article safety), "team-roster" (staffing/capacity), or "none" (no '
                "single page fixes this). "
                "Respond with ONLY a JSON object, no prose, no markdown fences: "
                '{"title": string, "description": string, "action": string, '
                '"severity": "info"|"warning"|"critical", "confidence": number '
                'between 0 and 1, "route": "policies"|"knowledge-base"|"team-roster"|"none"}.'
            ),
        },
        {
            "role": "user",
            "content": json.dumps(stats_summary),
        },
    ]

    try:
        synth_content = await asyncio.wait_for(
            call_openrouter(synth_messages), timeout=20.0
        )
        parsed = extract_json(synth_content)
    except Exception:
        log.exception("AI synthesis insight failed — omitting, not fabricating")
        return {"insight": None, "cached": False}

    if not parsed or not parsed.get("title") or not parsed.get("description"):
        return {"insight": None, "cached": False}

    ROUTE_MAP = {
        "policies": "/ai/policies",
        "knowledge-base": "/knowledge-base",
        "team-roster": "/team-roster",
    }
    route = ROUTE_MAP.get(parsed.get("route"))

    insight = {
        "type": "ai_synthesis",
        "severity": parsed.get("severity", "info"),
        "title": parsed["title"],
        "description": parsed["description"],
        "action": parsed.get("action", ""),
        "confidence": parsed.get("confidence", 0.5),
        "route": route,
        "guide": parsed.get("action") if route else None,
    }
    _synthesis_cache = insight
    _synthesis_cache_ts = time.monotonic()
    return {"insight": insight, "cached": False}


class DiagnoseRequest(BaseModel):
    title: str
    description: str
    type: str


@router.post("/diagnose")
async def diagnose_insight(req: DiagnoseRequest):
    if not openrouter_configured():
        raise HTTPException(
            status_code=503, detail="OPENROUTER_API_KEY not configured on backend"
        )

    try:
        evals, runs = await asyncio.gather(
            sb_get(
                "policy_eval_log",
                {
                    "select": "verdict,policy_hits,reason,inputs,evaluated_at",
                    "order": "evaluated_at.desc",
                    "limit": "50",
                },
            ),
            sb_get(
                "run_log",
                {
                    "select": "path,mttr_minutes,sla_state_before,department,category,entered_at",
                    "order": "entered_at.desc",
                    "limit": "50",
                },
            ),
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")

    supporting_data = {
        "recent_policy_evaluations": evals,
        "recent_run_log_rows": runs,
    }

    messages = [
        {
            "role": "system",
            "content": (
                "You are an operations analyst diagnosing a specific insight from a "
                "customer-support automation pipeline. You are given the insight and a "
                "slice of real recent supporting data (JSON). Produce a deeper diagnosis: "
                "likely root cause(s) and a concrete next step. You MUST ground every claim "
                "in the given data — cite real counts/values from it. Never invent tickets, "
                "numbers, or facts not present in the given data. If the data doesn't clearly "
                "support a root cause, say so honestly instead of guessing. Respond with "
                "plain text (2-4 sentences), no JSON, no markdown fences."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Insight type: {req.type}\nTitle: {req.title}\nDescription: {req.description}\n\n"
                f"Supporting data:\n{json.dumps(supporting_data)}"
            ),
        },
    ]

    diagnosis = await call_openrouter(messages)
    if not diagnosis.strip():
        raise HTTPException(
            status_code=502, detail="OpenRouter returned an empty diagnosis"
        )
    return {"diagnosis": diagnosis.strip()}
