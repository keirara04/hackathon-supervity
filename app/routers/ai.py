# app/routers/ai.py
"""
AI Manager — conversational surface grounded in real Supabase data.

Not a general chatbot: the model only answers using data returned by the
tools below (run_log/workbench_tasks/policy_config/policy_eval_log), and can
ask to trigger the Auto orchestrator. Uses OpenRouter (OpenAI-compatible REST)
so no extra SDK is needed — httpx is already a project dependency.
"""

import json
import logging
import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.supabase import SupabaseError, sb_get, sb_get_one
from .dashboard import get_kpis
from .data_manager import get_health

log = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Manager"])

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.2-3b-instruct")

AUTO_WORKFLOW_API_KEY = os.getenv("AUTO_WORKFLOW_API_KEY", "")
AUTO_WORKFLOW_ID = os.getenv("AUTO_WORKFLOW_ID", "")
AUTO_ORG_ID = os.getenv("AUTO_ORG_ID", "")

# meta-llama/llama-3.2-3b-instruct has no native tool-calling support on
# OpenRouter (sending `tools` 404s: "No endpoints found that support tool
# use"). Tools are described in the prompt instead, and the model is asked
# to respond with a strict JSON protocol that we parse manually.
TOOL_DESCRIPTIONS = """
- get_dashboard_kpis(): live operational KPIs — total tickets, auto-resolution rate, SLA
  compliance, MTTR, ticket volume by day, department breakdown.
- get_workbench_queue(status="open", limit=20): the human-in-the-loop exception queue.
- get_policy_config(): current live AI Policy levers (vip_always_escalate, min_kb_confidence, min_auto_score, etc).
- get_recent_policy_evals(limit=20): recent policy evaluation log rows (ticket, verdict, reason, policy hits).
- get_data_manager_health(): live up/down/not_configured status of every connected system (Supabase, Zendesk, Outlook).
- trigger_orchestrator_run(reason): trigger (or re-trigger) a run of the Auto Orchestrator.
""".strip()

# Static app knowledge — what each Command Center page shows and where its
# data comes from. Injected per-request based on context.page so the model
# can answer "explain this page" directly, without a tool call: this is
# knowledge about the app itself, not business data that could be stale or
# invented.
PAGE_KNOWLEDGE: dict[str, str] = {
    "/": (
        "Dashboard — live operational KPIs computed from run_log: total tickets, "
        "auto-resolution rate, SLA compliance at intake, average MTTR, ticket "
        "volume by day, and a department breakdown."
    ),
    "/workbench": (
        "Workbench — the human-in-the-loop exception queue, backed by "
        "workbench_tasks. Each item shows why the AI escalated it, the AI's "
        "diagnosis, and its recommendation. A human approves, modifies, or "
        "rejects, and the decision is recorded."
    ),
    "/ai/policies": (
        "AI Policies — the live governance levers (a singleton policy_config row) "
        "the Orchestrator reads before every decision: vip_always_escalate, "
        "min_kb_confidence, min_auto_score, auto_eligible_departments, and more. "
        "Editable with no code — changes apply on the agent's next run. Below the "
        "levers is the evaluation log (policy_eval_log), one row per past decision."
    ),
    "/ai/insights": (
        "AI Insights — patterns and recommendations computed live from "
        "policy_eval_log and run_log (never seeded/demo data), e.g. how much VIP "
        "escalation is driving human routing, or department-level auto-resolution "
        "rates. Each insight has a severity and a concrete action."
    ),
    "/data-manager": (
        "Data Manager — a live health registry of every system the AI Employee "
        "connects to: Supabase (system of record for tickets/policies/runs), "
        "Zendesk (channel — ticket intake/replies), and Outlook (channel — email "
        "intake and escalation notices). Each shows up/down/not_configured plus "
        "when it was last checked."
    ),
}


def _build_system_prompt(page: str) -> str:
    page_desc = PAGE_KNOWLEDGE.get(page, f"An unrecognized page at path {page}.")
    return f"""You are the AI Manager for an IT service desk Command Center.

The user is currently viewing: {page}
What that page shows: {page_desc}

HARD RULE: you have no built-in knowledge of tickets, policies, or metrics.
Any question about counts, tickets, policies, KPIs, the workbench queue, or
system health REQUIRES calling a tool FIRST. You are NEVER allowed to state a
number, ID, or fact about this system's *data* unless it came from a tool
result already shown to you in this conversation.

The one exception: questions about what a PAGE shows or does ("explain this
page", "what am I looking at"), greetings, and capability questions ("what can
you do") are answered directly from the page description above — no tool
needed for those, since that's static app knowledge, not business data.

Available tools:
{TOOL_DESCRIPTIONS}

Respond with ONLY raw JSON (no markdown fences, no extra text), in exactly one
of these two shapes:
1. To call a tool: {{"tool": "<tool_name>", "args": {{...}}}}
2. To give your final answer: {{"answer": "<your response to the user>"}}

If a tool returns no data, say so plainly rather than guessing.

Example — user asks "how many open tickets are in the workbench?":
{{"tool": "get_workbench_queue", "args": {{"status": "open"}}}}
(then, after seeing the result) {{"answer": "There are 39 open tickets in the workbench."}}

Example — user asks "explain this page":
{{"answer": "<restate the page description above in your own words>"}}"""


async def _tool_get_dashboard_kpis(_args: dict) -> dict:
    return await get_kpis()


async def _tool_get_workbench_queue(args: dict) -> dict:
    status = args.get("status", "open")
    limit = args.get("limit", 20)
    rows = await sb_get(
        "workbench_tasks",
        {"status": f"eq.{status}", "order": "created_at.desc", "limit": str(limit)},
    )
    return {"tasks": rows, "count": len(rows)}


async def _tool_get_policy_config(_args: dict) -> dict:
    row = await sb_get_one("policy_config", {"id": "eq.1"})
    return row or {}


async def _tool_get_recent_policy_evals(args: dict) -> dict:
    limit = args.get("limit", 20)
    rows = await sb_get(
        "policy_eval_log",
        {"order": "evaluated_at.desc", "limit": str(limit)},
    )
    return {"log": rows, "count": len(rows)}


async def _tool_get_data_manager_health(_args: dict) -> dict:
    return await get_health()


async def _tool_trigger_orchestrator_run(args: dict) -> dict:
    if not (AUTO_WORKFLOW_API_KEY and AUTO_WORKFLOW_ID and AUTO_ORG_ID):
        return {
            "status": "not_configured",
            "detail": "Auto orchestrator credentials not set yet — waiting on Amsyar's workflowId/API key.",
        }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://auto.supervity.ai/api/v1/workflow-runs/execute",
                headers={
                    "Authorization": f"Bearer {AUTO_WORKFLOW_API_KEY}",
                    "x-active-org": AUTO_ORG_ID,
                    "x-source": "external",
                },
                data={"workflowId": AUTO_WORKFLOW_ID, "inputs": json.dumps({"reason": args.get("reason", "")})},
            )
        if resp.status_code >= 300:
            return {"status": "error", "detail": f"Auto returned HTTP {resp.status_code}: {resp.text[:300]}"}
        return {"status": "triggered", "detail": resp.json()}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "detail": str(e)}


TOOL_IMPLS = {
    "get_dashboard_kpis": _tool_get_dashboard_kpis,
    "get_workbench_queue": _tool_get_workbench_queue,
    "get_policy_config": _tool_get_policy_config,
    "get_recent_policy_evals": _tool_get_recent_policy_evals,
    "get_data_manager_health": _tool_get_data_manager_health,
    "trigger_orchestrator_run": _tool_trigger_orchestrator_run,
}


class ChatHistoryItem(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatHistoryItem] = []
    context: dict[str, Any] = {}


async def _call_openrouter(messages: list[dict]) -> str:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured on backend")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": OPENROUTER_MODEL,
                "messages": messages,
            },
        )
    if resp.status_code >= 300:
        raise HTTPException(status_code=502, detail=f"OpenRouter error {resp.status_code}: {resp.text[:500]}")
    return resp.json()["choices"][0]["message"]["content"] or ""


def _extract_json(text: str) -> dict | None:
    """Best-effort JSON extraction — small models sometimes wrap JSON in
    prose or markdown fences despite instructions."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


@router.post("/chat")
async def chat(body: ChatRequest):
    page = body.context.get("page", "unknown")
    messages: list[dict] = [{"role": "system", "content": _build_system_prompt(page)}]
    messages += [{"role": h.role, "content": h.content} for h in body.history]
    messages.append({"role": "user", "content": body.message})

    tool_call_log: list[dict] = []
    nudged = False

    try:
        for _ in range(4):
            content = await _call_openrouter(messages)
            parsed = _extract_json(content)

            if parsed is None or "answer" in parsed:
                answer = parsed["answer"] if parsed and "answer" in parsed else content

                # Guard: a data-shaped answer (contains a digit) given before
                # any tool was called is almost certainly a hallucination —
                # force one retry with an explicit nudge instead of trusting it.
                if not tool_call_log and not nudged and any(c.isdigit() for c in str(answer)):
                    nudged = True
                    messages.append({"role": "assistant", "content": content})
                    messages.append(
                        {
                            "role": "user",
                            "content": (
                                "You answered with a number/fact but haven't called any tool yet — "
                                "that data must come from a tool. Call the relevant tool now."
                            ),
                        }
                    )
                    continue

                return {"response": answer or "I don't have an answer for that.", "tool_calls": tool_call_log}

            name = parsed.get("tool")
            args = parsed.get("args") or {}
            impl = TOOL_IMPLS.get(name)

            if impl is None:
                result: Any = {"error": f"Unknown tool '{name}'"}
            else:
                try:
                    result = await impl(args)
                except SupabaseError as e:
                    result = {"error": f"Supabase error: {e.detail}"}

            call_id = f"call_{len(tool_call_log)}"
            tool_call_log.append({"id": call_id, "name": name or "unknown", "args": args, "result": result})

            messages.append({"role": "assistant", "content": content})
            messages.append(
                {
                    "role": "user",
                    "content": (
                        f"Tool result for {name}: {json.dumps(result, default=str)}\n\n"
                        "Respond with your next JSON step."
                    ),
                }
            )

        return {
            "response": "I gathered some data but couldn't finish reasoning about it — try rephrasing your question.",
            "tool_calls": tool_call_log,
        }
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        log.exception("AI Manager chat failed")
        raise HTTPException(status_code=500, detail=str(e))
