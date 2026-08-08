# AIDEN Command Center — Status & Next Steps

**Context:** Supervity Autopilot Asia Hackathon 2026, Round 2. Track 3 (Customer Support — Service Desk Command Center). Team: Keira + Amsyar Hakimi. Deadline: remote build closes end of day Aug 7; offline build + code freeze Aug 8 (11:59 PM APU); Grand Finale Aug 9.

**Repo:** `AutoPilot-Template` (FastAPI backend + Next.js/React frontend, Docker Compose, Postgres for the template's own auth/audit — NOT where our business data lives).

**Business data lives in Supabase** project `ovtxhlpeixfjyyxqufhw` ("AI Employee Project"), accessed by the backend via raw HTTP calls to PostgREST (`SUPABASE_URL` + `SUPABASE_KEY` env vars), matching the pattern already used by the Auto operators. This is a deliberate choice — do NOT try to point SQLAlchemy/the template's own Postgres at this data.

**Division of labor:** Amsyar owns everything on auto.supervity.ai (Orchestrator + 5 Operators — Sweep, Triage, Diagnose, Score & Decide, Remediate, Escalation). Keira owns the entire Command Center (this repo).

---

## Gate requirements (from Round 2 Participant Guide + Command Center Guide) — must all be true to pass judging

- [x] Orchestrator + 5+ Operators on Auto (Amsyar — in progress, wiring is current top task)
- [x] 3+ live integrations, 2+ categories, 1 channel + 1 system of record (Zendesk + Supabase + Outlook — met)
- [x] Backend API integration with Auto's orchestration endpoints — **NOT YET DONE, blocked on Amsyar's workflowId**
- [x] Live human loop / Workbench with a real exception resolved — **DONE** (see below)
- [ ] 3+ AI Policies, no-code editable, evaluated before action, logged — **DONE on backend+frontend, one UI bug remaining** (see below)
- [ ] AI Insights generated from real processed data — **NOT STARTED**
- [ ] Dashboard showing live agent activity (not template demo data) — **NOT STARTED**
- [ ] Data Manager — live health registry of connected systems — **NOT STARTED**
- [ ] AI Manager chat grounded in real data, can trigger Operators — **NOT STARTED**, lowest priority (smallest rubric weight)

**Important:** the qualification gate explicitly rejects "a frontend showing seeded numbers, or a dashboard that never changes when the agent runs." Every remaining page must use real Supabase data — no reuse of any `DEMO_*` arrays already in the template.

---

## What's built so far (this session)

### 1. Workbench — DONE, verified working end to end
- **Backend:** `app/routers/workbench.py` — `GET /api/workbench` (list, default filter `status=open`), `GET /api/workbench/{task_id}`, `PATCH /api/workbench/{task_id}/decide`.
- **Real schema for `workbench_tasks`:** `id, task_id, ticket_id, run_id, task_type, context (jsonb), recommendation, assigned_to, status, human_decision, resolved_by, created_at, decided_at`.
- **IMPORTANT constraint:** `workbench_status_chk` only allows `status` values: `open, approved, modified, rejected, resolved`. There is NO `pending` value — `open` is the starting state. The backend maps `human_decision` (`approve`/`edit`/`reject`) → `status` (`approved`/`modified`/`rejected`) via `DECISION_TO_STATUS` dict in the router.
- **Frontend:** `frontend/src/app/workbench/page.tsx` — fully replaced the placeholder "AI Assistant/Automation Builder" tool-card shell. Real queue + detail panel + approve/modify/reject buttons, wired to the API above via `apiClient` from `frontend/src/lib/api-client.ts`.
- **Test data:** one synthetic row `test-task-001` / ticket `ITSM-0042` was inserted directly into Supabase to unblock frontend dev while Amsyar's Escalation operator wasn't yet writing real rows. **This should be deleted or reset before the real demo**, and real rows should come from Amsyar's Escalation operator once `remediation_status='escalated'` handling is fixed (see his side of the spec doc).
- **Known gap:** Escalation operator (Amsyar's side) needs to actually start writing to `workbench_tasks` for real tickets. Right now the table may still be empty except for test data.

### 2. AI Policies — DONE on backend + frontend, one CSS bug to fix
- **Decision made:** did NOT reuse the template's fancy demo Policy CRUD components (`PolicyCard`, `PolicyEditModal`, `StructuredBuilder`, etc.) because they're built around a fundamentally different data model (a list of independent DSL-based rules) vs. our reality (one singleton `policy_config` row with fixed named levers). Building an adapter layer would have cost more time than it saved. Built a dedicated, simpler, fully-real page instead.
- **Backend:** `app/routers/policies.py` — `GET /api/policies/schema` (returns lever metadata so frontend renders controls generically), `GET /api/policies` (live singleton row), `PATCH /api/policies` (updates one or more levers, rejects unknown keys), `GET /api/policies/log?limit=N` (audit trail from `policy_eval_log`).
- **Real schema for `policy_config`:** singleton row (`id=1`), columns: `vip_always_escalate (bool)`, `min_kb_confidence (numeric)`, `min_auto_score (numeric)`, `auto_eligible_departments (array)`, `allowed_categories (array)`, `change_required_components (array)`, `major_incident_threshold (int)`, `csat_escalate_below (int)`, `followup_minutes (int)`, `fetch_per_batch (text)`, `escalation_email (text)`, plus `updated_at`/`updated_by` (read-only metadata). ALL 11 editable levers are covered — verify none were dropped if the schema ever changes.
- **Real schema for `policy_eval_log`:** `id, ticket_id, run_id, evaluated_at, policy_snapshot (jsonb), inputs (jsonb), verdict, policy_hits (jsonb array), reason`. Currently has 60 real rows from actual pipeline runs.
- **Frontend:** `frontend/src/app/ai/policies/page.tsx` — fully replaced. Shows all 11 levers via a schema-driven `LeverControl` component (renders toggle/number/array/text input based on `type` from `/api/policies/schema` — this means new levers added later require zero frontend changes), batches edits into one PATCH via a "Save changes" button with an unsaved-changes indicator per field, and a full eval log table below (ticket, verdict badge, reason, policy hits, timestamp).
- **KNOWN BUG (unresolved at last check):** the boolean toggle switch (`Icons`-free custom `<button role="switch">`) is rendering out of its intended box — likely inheriting global button reset styles. Fix in progress: add `type="button"`, `border-0 p-0 outline-none appearance-none shrink-0`, and explicit inline `minWidth`/`maxWidth` to the toggle's className/style. **If still broken after that change, check for a global `button { ... }` rule:**
  ```bash
  grep -n -A 5 "^button" frontend/src/app/globals.css frontend/src/styles/*.css 2>/dev/null
  ```
  and scope/override it specifically for this switch.
- **This is genuinely live** — toggling `vip_always_escalate` and saving actually changes what Amsyar's Score & Decide operator will do on the next run (reads `policy_config` fresh each run). This is the "judge edits a threshold live and asks you to re-run" scenario from the guide — make sure it's demoed.

---

## Common pitfalls hit this session (avoid repeating)

1. **File writes that silently produce empty files.** Twice, a new router file (`workbench.py`, and nearly `policies.py`) was created but ended up 0 bytes — the content never actually landed. **Always verify after writing:** `wc -l <file>` should be non-zero before moving on.
2. **`app/routers/__init__.py` edits not landing.** The backend crash-loops with `ImportError: cannot import name 'X_router' from 'app.routers'` if the router is imported/used in `main.py` but not actually exported from `__init__.py`. **Always verify with `grep -c "X_router" app/routers/__init__.py`** (should return 2: one import line, one in `__all__`) before rebuilding.
3. **Docker port conflicts.** Port 8001 (backend) can get squatted by unrelated local processes — check with `lsof -i :8001` before assuming Docker itself is broken.
4. **Transient Docker Hub TLS timeouts.** `TLS handshake timeout` on `make up` is usually just a network blip — retry `make up` before troubleshooting further.
5. **Check constraints don't match the spec doc.** `workbench_status_chk` only allows `open/approved/modified/rejected/resolved` — NOT `pending` as older docs implied. **Always verify actual constraints before writing insert/update logic:**
   ```sql
   select conname, pg_get_constraintdef(oid) as definition
   from pg_constraint
   where conname = '<constraint_name>';
   ```
6. **Backend requires a full rebuild, not just restart, after adding new Python files:**
   ```bash
   docker compose up --build -d backend
   ```
   Same for frontend after `.tsx` changes:
   ```bash
   docker compose up --build -d frontend
   ```
7. **Icon names must be verified against the actual icon map** (`frontend/src/components/ui/icons.tsx`) before use — e.g. `Icons.x` doesn't exist, it's `Icons.close`. Grep first, don't assume Lucide-style names map 1:1.

---

## Immediate next steps, in priority order

### 1. Fix the Policies toggle CSS bug (small, do first)
See "KNOWN BUG" above. Apply the fix, rebuild frontend, verify visually at `http://localhost:3001/ai/policies`.

### 2. Clean up test data before any real demo
```sql
-- Either delete the test row entirely, or reset it to 'open' so the queue isn't empty:
delete from workbench_tasks where task_id = 'test-task-001';
```

### 3. Data Manager page (fast win, no dependency on Orchestrator)
Live health registry of connected systems. Build:
- **Backend:** `app/routers/data_manager.py` — a `GET /api/data-manager/health` endpoint that pings Zendesk, Supabase, and Outlook and returns status per system (up/down, last checked, what it's used for). For Supabase, a simple `GET` to any known table (e.g. `policy_config?limit=1`) with a short timeout is sufficient as a health check. For Zendesk, hit a lightweight authenticated endpoint (e.g. `/api/v2/users/me.json`). For Outlook, check whatever auth/token state is available.
- **Frontend:** new page or section showing each system as a card with a green/red status dot, "what it's used for" text, and last-checked timestamp.
- This is fully independent of the Orchestrator being wired — do this next while waiting on Amsyar.

### 4. AI Insights page
Must be computed from real processed data (`run_log`, `policy_eval_log` — NOT the template's static demo insights). Good candidates given available data:
- From `policy_eval_log`: "X% of tickets are being escalated purely due to `vip_always_escalate` — consider a VIP fast-track policy instead" (recurring pattern → automation-opportunity insight).
- From `policy_eval_log`: department-level auto vs. human split (e.g. "IT tickets auto-resolve at X% vs Y% for other departments").
- From `run_log` (once populated with more real runs): SLA-breach forecasting, recurring KB article usage clusters.
- **Backend:** `app/routers/insights.py` — can either compute these with plain SQL aggregation queries against Supabase, or (better per the guide) use an LLM call to synthesize the aggregated data into natural-language insights with severity + action path. Given time constraints, start with the deterministic/aggregation version; add an LLM synthesis layer only if time allows.
- **Frontend:** replace `frontend/src/app/ai/insights/page.tsx`'s demo data the same way Policies was handled — real fetch, no reuse of demo arrays unless the component's data shape genuinely matches (check before assuming, same lesson as Policies).

### 5. Dashboard — wire to live data
Currently showing template seed data ("2,528 sessions" etc.) — this is a **gate failure** if left as-is per the guide's explicit warning about dashboards that don't move.
- **Backend:** endpoint(s) that compute real KPIs from `run_log`: MTTR, SLA compliance %, auto-resolution rate, ticket volume trend. Reuse/extend the `policy_eval_log` auto vs human counts already built for the Policies stats bar.
- **Frontend:** replace the seeded "Weekly Activity" chart and stat cards in `frontend/src/app/dashboard/page.tsx` (or wherever the dashboard route lives — verify path) with real data.

### 6. Backend ↔ Auto Orchestrator wiring (blocked until Amsyar has a workflowId)
Once Amsyar's Orchestrator is ready:
- Get `workflowId` (UUID) from Amsyar or `GET /api/v1/workflows` at `auto.supervity.ai`.
- Generate a Workflow API key at `https://auto.supervity.ai/u/api-keys` if not already done; store in `.env` as e.g. `AUTO_WORKFLOW_API_KEY` and `AUTO_WORKSPACE_ID` — never commit, never expose to frontend.
- Backend route to trigger a run: `POST https://auto.supervity.ai/api/v1/workflow-runs/execute/stream` (SSE, preferred for UI feedback) or `.../execute` (blocking, simpler for a first test). Required headers: `Authorization: Bearer <key>`, `x-active-org: <org>`, and — since this is a Custom API Key — `x-source: external`. Body is `multipart/form-data` with `workflowId`, `inputs` (JSON), optional `envs`.
- Wire the AI Manager chat page (`frontend/src/app/ai/manager` or similar — verify path) to call this trigger endpoint, and to answer questions grounded in `run_log`/`workbench_tasks`/`policy_eval_log` data (not a general chatbot).
- This unblocks the true end-to-end demo: trigger → Orchestrator on Auto → Policies gate → Workbench exception → Dashboard/Insights update.

### 7. Full end-to-end demo rehearsal
Once #6 is done, run the complete flow live at least once before the offline day:
trigger arrives → backend calls Orchestrator → Operators run → Policies evaluate → one ticket routes to Workbench → resolve it as a human → confirm Dashboard/Insights reflect the new state.

---

## Reference: verified real Supabase schemas (don't trust older spec docs over this)

**`workbench_tasks`:** `id (bigint), task_id (text), ticket_id (text), run_id (uuid), task_type (text), context (jsonb), recommendation (text), assigned_to (text), status (text, CHECK: open/approved/modified/rejected/resolved), human_decision (text), resolved_by (text), created_at (timestamptz), decided_at (timestamptz)`

**`policy_config`:** `id (integer, singleton row id=1), vip_always_escalate (boolean), min_kb_confidence (numeric), auto_eligible_departments (array), updated_at (timestamptz), updated_by (text), escalation_email (text), followup_minutes (integer), min_auto_score (numeric), change_required_components (array), major_incident_threshold (integer), csat_escalate_below (integer), fetch_per_batch (text), allowed_categories (array)`

**`policy_eval_log`:** `id (bigint), ticket_id (text), run_id (uuid), evaluated_at (timestamptz), policy_snapshot (jsonb), inputs (jsonb), verdict (text), policy_hits (jsonb), reason (text)`

---

## Environment / access reference

- Supabase project: `ovtxhlpeixfjyyxqufhw` — connect via `SUPABASE_URL` + `SUPABASE_KEY` env vars in backend `.env`, calling PostgREST directly with `httpx` (pattern established in `workbench.py` and `policies.py` — replicate for new routers).
- Template local services: Dashboard `http://localhost:3001`, API docs `http://localhost:8001/api/docs`, Postgres (template's own, unrelated to business data) `localhost:5432` user `user` pass `password`.
- Rebuild commands: `docker compose up --build -d backend` / `... frontend` after any code change to that side.
