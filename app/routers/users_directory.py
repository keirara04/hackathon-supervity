# app/routers/users_directory.py
"""
Users Directory — full CRUD over Supabase `users_directory`, the identity
source the Triage operator resolves tickets' requesters against (read-only
from Triage's side — it only looks up account_id, never writes here — so
CRUD here can't corrupt live pipeline state).
"""

import logging
import secrets

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.supabase import SupabaseError, sb_delete, sb_get, sb_get_one, sb_patch, sb_post

log = logging.getLogger(__name__)

router = APIRouter(prefix="/users-directory", tags=["Users Directory"])


class UserCreate(BaseModel):
    display_name: str
    email_address: str | None = None
    department: str | None = None
    x_vip: bool = False
    location: str | None = None


class UserUpdate(BaseModel):
    display_name: str | None = None
    email_address: str | None = None
    department: str | None = None
    x_vip: bool | None = None
    location: str | None = None


@router.get("")
async def list_users():
    try:
        rows = await sb_get("users_directory", {"order": "display_name.asc"})
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    return {"users": rows, "count": len(rows)}


@router.post("")
async def create_user(body: UserCreate):
    account_id = secrets.token_hex(12)  # 24 hex chars, matches the existing real ID format
    payload = {"account_id": account_id, **body.model_dump()}
    try:
        rows = await sb_post("users_directory", payload)
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    return rows[0]


@router.patch("/{account_id}")
async def update_user(account_id: str, body: UserUpdate):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields provided")
    try:
        rows = await sb_patch("users_directory", {"account_id": f"eq.{account_id}"}, updates)
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    return rows[0]


@router.delete("/{account_id}")
async def delete_user(account_id: str):
    try:
        existing = await sb_get_one("users_directory", {"account_id": f"eq.{account_id}"})
        if existing is None:
            raise HTTPException(status_code=404, detail="User not found")
        await sb_delete("users_directory", {"account_id": f"eq.{account_id}"})
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=f"Supabase error: {e.detail}")
    return {"status": "deleted", "account_id": account_id}
