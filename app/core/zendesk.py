# app/core/zendesk.py
"""
Shared Zendesk client — OAuth client_credentials token exchange, reused by
the Data Manager health check and the live ticket viewer/importer.
"""

import os

import httpx

ZENDESK_SUBDOMAIN = os.getenv("ZENDESK_SUBDOMAIN", "")
ZENDESK_CLIENT_ID = os.getenv("ZENDESK_CLIENT_ID", "")
ZENDESK_CLIENT_SECRET = os.getenv("ZENDESK_CLIENT_SECRET", "")
ZENDESK_TOKEN_URL = os.getenv("ZENDESK_TOKEN_URL", "")


def zendesk_configured() -> bool:
    return bool(ZENDESK_SUBDOMAIN and ZENDESK_CLIENT_ID and ZENDESK_CLIENT_SECRET and ZENDESK_TOKEN_URL)


async def get_zendesk_token(client: httpx.AsyncClient) -> str | None:
    """Exchange client_credentials for a Bearer token. Returns None (never
    raises) if the exchange fails, so callers can report status cleanly."""
    if not zendesk_configured():
        return None
    resp = await client.post(
        ZENDESK_TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": ZENDESK_CLIENT_ID,
            "client_secret": ZENDESK_CLIENT_SECRET,
            "scope": "read",
        },
    )
    if resp.status_code >= 300:
        return None
    return resp.json().get("access_token")
