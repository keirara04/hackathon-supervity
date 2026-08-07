# app/core/supabase.py
"""
Thin async client for Supabase's PostgREST API — the system of record for
all business data (run_log, workbench_tasks, policy_config, etc).

Not to be confused with app/core/database.py, which is the template's own
Postgres (auth/audit only, unrelated to business data).
"""

import os

import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")


def _headers(prefer: str | None = None) -> dict:
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


class SupabaseError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Supabase error {status_code}: {detail}")


async def sb_get(table: str, params: dict | None = None) -> list[dict]:
    """GET rows from a table/view. `params` are raw PostgREST query params
    (e.g. {"status": "eq.open", "order": "created_at.desc", "limit": "20"})."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=_headers(),
            params=params or {},
        )
    if resp.status_code >= 300:
        raise SupabaseError(resp.status_code, resp.text)
    return resp.json()


async def sb_get_one(table: str, params: dict) -> dict | None:
    rows = await sb_get(table, params)
    return rows[0] if rows else None


async def sb_patch(table: str, params: dict, body: dict) -> list[dict]:
    """PATCH rows matching `params` filters with `body`. Returns updated rows."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=_headers(prefer="return=representation"),
            params=params,
            json=body,
        )
    if resp.status_code >= 300:
        raise SupabaseError(resp.status_code, resp.text)
    return resp.json()


async def sb_post(table: str, body: dict | list[dict]) -> list[dict]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=_headers(prefer="return=representation"),
            json=body,
        )
    if resp.status_code >= 300:
        raise SupabaseError(resp.status_code, resp.text)
    return resp.json()


async def sb_health() -> tuple[bool, str]:
    """Lightweight connectivity check used by the Data Manager."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/policy_config",
                headers=_headers(),
                params={"limit": "1"},
            )
        if resp.status_code < 300:
            return True, "ok"
        return False, f"HTTP {resp.status_code}"
    except Exception as e:  # noqa: BLE001 — health check must never raise
        return False, str(e)
