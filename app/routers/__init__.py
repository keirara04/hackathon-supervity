# app/routers/__init__.py
"""
API Routers - Modular endpoint organization.

Note: File endpoints are defined in main.py to maintain proper path ordering.
"""

from .admin import router as admin_router
from .ai import router as ai_router
from .audit import router as audit_router
from .auth import router as auth_router
from .dashboard import router as dashboard_router
from .data_manager import router as data_manager_router
from .examples import router as examples_router
from .health import router as health_router
from .incidents import router as incidents_router
from .insights import router as insights_router
from .items import router as items_router
from .kb_articles import router as kb_articles_router
from .policies import router as policies_router
from .run_log import router as run_log_router
from .team_roster import router as team_roster_router
from .triage_queue import router as triage_queue_router
from .users_directory import router as users_directory_router
from .workbench import router as workbench_router
from .zendesk import router as zendesk_router

__all__ = [
    "health_router",
    "auth_router",
    "admin_router",
    "audit_router",
    "items_router",
    "examples_router",
    "workbench_router",
    "policies_router",
    "data_manager_router",
    "insights_router",
    "dashboard_router",
    "ai_router",
    "kb_articles_router",
    "run_log_router",
    "triage_queue_router",
    "incidents_router",
    "zendesk_router",
    "team_roster_router",
    "users_directory_router",
]
