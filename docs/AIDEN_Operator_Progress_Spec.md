# AIDEN — Operator Progress & Data-Flow Spec (Round 2)

Live build state, grounded in the real Supabase schema (project `ovtxhlpeixfjyyxqufhw`).
This updates the idealized PDF spec with what is actually built, the real column names, and how each
integration is called. Status legend: ✅ built & verified · 🟡 built / partial · 🔴 not built.

**Outcome metrics:** MTTR · SLA compliance · auto-resolution rate · CSAT.
**Final output:** one consolidated `run_log` row per ticket → feeds the metrics above.

---

## Integrations (how each is called)

| System | Role | How it's called |
|---|---|---|
| **Zendesk** | Channel (intake + requester replies) | OAuth `client_credentials` token exchange (`ZENDESK_SUBDOMAIN`, `ZENDESK_CLIENT_SECRET`, `ZENDESK_TOKEN_URL`) → Bearer token. Intake: `GET /api/v2/search.json?query=type:ticket status<solved -tags:aiden_processed` + `GET /api/v2/users/show_many.json`. Reply: `PUT /api/v2/tickets/{id}.json` public comment. Needs **write** scope. |
| **Outlook** | Channel (email intake + escalation email) | Native Auto integration. Escalation notice sent to `policy_config.escalation_email`. |
| **Supabase** | System of record | Raw HTTP to PostgREST (`{{SUPABASE_URL}}` + `{{SUPABASE_KEY}}`), headers `apikey`, `Authorization: Bearer`, `Prefer: return=representation`. Explicit 2xx checks, per-ticket loop, fail-safe on non-2xx. RLS disabled on operational tables (hackathon choice). |
| **SharePoint** | Store (dataset seed) | Person A. Source park for the dataset pulled through an integration. |
| **Airtable** | System of record (access register origin) | Person A. |

**Integration floor (Round 2):** ≥3 live across ≥2 categories — Zendesk (channel) + Supabase (system of record) + Outlook (channel/human loop). ✅ met.

---

## Supabase tables (real)

| Table | Role |
|---|---|
| `triage_queue` | Triage output queue. PK `issue_key`. Carries `account_id`, `cluster_key`. |
| `run_log` | Pipeline ledger. Keyed `ticket_id` + `run_id`. One consolidated record per ticket. Holds `RUN_SUMMARY` metadata rows. |
| `assets_access` | Access register / remediation target. PK `object_key`. Status Pending/Active/Revoked. Joined via `account_id` + `system`. |
| `kb_articles` | Knowledge base. Carries `x_auto_safe` + `action_type` (`grant_access`/`send_steps`/`escalate`). |
| `policy_config` | Singleton (`id=1`) — the dynamic AI-policy engine. |
| `policy_eval_log` | One row per policy evaluation (audit). |
| `users_directory` | Identity source. `account_id` ↔ `display_name`, `x_vip`, `department`. |
| `incidents`, `workbench_tasks`, `escalations`, `change_requests`, `csat_surveys` | Downstream tables (mostly awaiting their operators). |

**Live policy levers (`policy_config`):** `vip_always_escalate`, `min_kb_confidence`, `min_auto_score`,
`auto_eligible_departments`, `allowed_categories`, `change_required_components`,
`major_incident_threshold`, `csat_escalate_below`, `followup_minutes`, `fetch_per_batch`,
`escalation_email`.

---

## Orchestrator — Stalled-Ticket Resolver 🟡
- **Fields:** `batch_id`, `cursor`, `retry_count`.
- **Policy read:** reads whole `policy_config` once per batch.
- **In:** trigger `{ batch_id, channels[] }`.
- **Out:** array of `run_log` records.
- **Role:** coordinates operators by name, passes context, retries, escalates, aggregates. Runtime order sets the pipeline; operators are independent workflows.
- **Status:** operators built separately; full Orchestrator wiring is the current top task.

---

## 1 · Sweep / Intake & Normalize ✅
- **Integration:** Zendesk (+ Outlook / chat), read-only. Stateless full re-sweep every run.
- **Fields:** `source_channel`, `source_id`, `raw_reporter`, `summary`, `description`, `created_at`, `due_date`, `batch_limit`.
- **Policy read:** `fetch_per_batch` (page size ~25–30).
- **In:** channel poll + cursor.
- **Out (12-key normalized payload):** `ticket_id`, `source_channel`, `created_at`, `requester_name`, `requester_email`, `subject`, `description`, `priority`, `status`, `tags`, `raw_url`, `external_ref` + `total_count`, `is_last_batch`.
- **Notes:** dedup NOT done here (intentional, re-runnable demos). Known mismatch: emits `subject`/`requester_name`; downstream expects `summary`/`raw_reporter` → mapped in Triage.

## 2 · Triage ✅ (verified)
- **Integration:** Supabase (`users_directory` lookup, writes `triage_queue`).
- **Fields:** `raw_reporter`→`account_id`, `identity_status`, `is_vip`, `department`, `email_address`, `hours_to_breach`, `sla_tier`/`sla_state`, `priority_score`, `rank`, `cluster_key`.
- **Policy read:** SLA hours by priority, VIP boost, escalation-risk weight.
- **In:** one intake record.
- **Out → `triage_queue`:** `account_id`, `identity_status`, `is_vip`, `department`, SLA fields, `priority_score`, `rank`, `cluster_key`.
- **Verified:** identity resolution works — 82 tickets, all resolve to real directory accounts (45 distinct).
- **Release step (Triage → run_log):** seeds `run_log` rows `path='pending'`, copies `cluster_key`, `issue_id`, `run_id`, and **`account_id` → `requester_account_id`** (field-name mismatch fixed — was the null-account_id bug).

## 3 · Diagnose & Correlate ✅ (Person A, verified)
- **Integration:** Supabase (`kb_articles`, `assets_access` findings).
- **Fields:** `kb_article_id`, `kb_confidence` (0–1), `kb_auto_safe`, `root_cause`, `category`, `diagnosis`.
- **In:** one triaged ticket.
- **Out → `run_log`:** `kb_article_id`, `kb_confidence`, `kb_auto_safe`, `root_cause`, `category`, `diagnosis`, `diagnosed_at`, `diagnose_status='done'`. Does NOT write `cluster_key` (owned by Triage).
- **Note:** matcher has slight run-to-run non-determinism on borderline KB matches.

## 4 · Major-Incident Commander 🔴 (not built)
- **Integration:** Supabase (`incidents`, `run_log`).
- **Fields:** `cluster_key`, `cluster_size`, `parent_incident_id`, `incident_title`, `root_signal`, `child_count`, `status`, `child_status`.
- **Policy read:** `major_incident_threshold`.
- **In:** batch grouped by `cluster_key`.
- **Out → `incidents`:** `parent_incident_id`, `incident_title`, `root_signal`, `child_ticket_ids[]`, `child_count`, `status`; per child in `run_log`: `parent_incident_id`, `child_status`.
- **Child lifecycle:** open → frozen → closed → reopened → detach.
- **Design musts:** count DB-wide (run_log open + triage_queue waiting), backfill on declaration, idempotent parent. Volume alone is NOT the trigger — needs tight time-window + outage language + `linked_incident`.
- **Status:** differentiator, not a gate item. Deferred behind the closing loop + Command Center.

## 5 · Score & Decide (Remediation Decision) ✅ (verified)
- **Integration:** Supabase (`run_log`, `policy_config`, `policy_eval_log`).
- **Fields:** `kb_confidence`, `kb_auto_safe`, `category`, `is_vip`, `auto_score` (0–1), `verdict`, `path`, `decision_reason`, `policy_hits`.
- **Policy read:** `min_auto_score`, `min_kb_confidence`, `auto_eligible_departments`, `vip_always_escalate`.
- **In:** one diagnosed ticket + policy.
- **Out → `run_log`:** `path` (`auto`/`human`), `verdict`, `decision_reason`, `auto_score`, `policy_hits`, `decided_at`. Logs every eval to `policy_eval_log`.
- **Decision order:** missing input → human · `vip_always_escalate` ON & VIP → human · auto-safe & conf ≥ `min_kb_confidence` & score ≥ `min_auto_score` → auto · else human.
- **Verified behaviour:** auto-safe access tickets (shared-drive, sso, password) currently route **human only because they are VIP** — one `vip_always_escalate` OFF flip moves them to `auto` (the demo money-shot).
- **Known:** `auto_eligible_departments` currently a soft nudge, not a hard gate.

## 6 · Remediate & Verify (Auto-Remediation Executor) 🟡 (v2 written, needs live test)
- **Integration:** Supabase (`run_log`, `kb_articles`, `assets_access`) + Zendesk reply.
- **Fields:** `action` (`grant_access`/`send_steps`), `result` (`resolved`/`already_active`/`escalated`), `remediation_status` (`done`/`escalated`), `resolved_at`, `error_message`, `payload` (incl. `comms_status`), `remediation_ref`.
- **In:** `run_log` where `path=auto` & `remediation_status is null`.
- **Flow:**
  - Read `action_type` from `kb_articles` (source of truth, not re-derived).
  - **grant_access:** map `cluster_key`→`system` → find grant by `account_id`+`system` → branch on status (Pending→flip Active, Active→already, Revoked/none/2+→escalate) → **verify by independent re-read** → rollback on mismatch.
  - **send_steps:** send KB `workaround` to requester.
  - **Reply in Zendesk** (public comment) **before** marking done — `done` = resolved AND notified.
  - Non-blocking send: 2xx=sent · 404/seed=skipped (still done) · 401/403=pause+retry.
- **Out → `run_log`:** the fields above; flips `assets_access.status` Pending→Active + `remediated_at` + `remediation_ref` on real grants.
- **Escalation handoff:** marks `remediation_status='escalated'` — the Escalation operator must fetch this (not only `verdict=human`).
- **Status:** ran once (send_steps only, all auto tickets were non-access); DB reset. Needs a `grant_access` ticket in the auto queue (via VIP flip) to test the real flip. Zendesk **write scope** must be confirmed.

## 7 · Requester Comms 🟡 → merged into Remediate for success path
- **Integration:** Zendesk public comment / Outlook.
- **Fields:** `channel`, `message_body`, `external_ref`, `message_sent`.
- **In:** resolved / updated ticket.
- **Out:** `{ channel, message_sent, external_ref }`.
- **Decision:** success messaging now happens **inside Remediate** (send-before-done, avoids false close). A standalone Comms operator is only needed if separated later.

## 8 · Escalation & Change-Approval Router 🟡 (built / partial, my side)
- **Integration:** Supabase (`workbench_tasks`, `escalations`, `change_requests`) + Outlook.
- **Fields:** `component`, `request_type`, `assignee`, `assignee_email`, `workbench_task_id`, `change_request_id`, `approval_status`, `proposed_workaround`, `recommendation`.
- **Policy read:** `assignment_routing` (component→assignee), `change_required_components`.
- **In:** ticket with `verdict='human'` — ⚠️ **must also fetch `remediation_status='escalated'`** to pick up Remediate's fail-closed cases.
- **Out → `run_log` / tables:** `workbench_task_id`, `assigned_to`, `change_request_id`, `approval_status`, `recommendation`.
- **Uses:** `policy_config.escalation_email` exclusively (hardcoded fallbacks removed).

## 9 · CSAT Follow-up 🔴 (upcoming)
- **Integration:** Supabase (`csat_surveys`) + channel.
- **Fields:** `resolved_at`, `survey_sent`, `csat_score` (1–5), `csat_comment`, `reopened`, `escalated`.
- **Policy read:** `csat_escalate_below`.
- **In:** resolved ticket.
- **Out → `run_log` / `csat_surveys`:** `csat_score`, `reopened`, `escalated`. Poor score → escalate.

## Workbench 🔴 (Command Center surface — coded, not an Auto operator)
- **Fields:** `task_id`, `context`, `recommendation`, `human_decision` (approve/edit/reject).
- **In:** escalated item with full context.
- **Out:** `{ human_decision, resolved_by, decided_at }`.
- **Feeds the human-loop requirement.**

## Summary → run_log ✅ (schema live)
- One consolidated record per ticket → feeds MTTR, SLA compliance, auto-resolution rate, CSAT.

---

## Where we stand (one-line each)
- ✅ Sweep · Triage · Diagnose · Score & Decide — built and verified.
- ✅ account_id leak fixed (Release field-name mapping) — join to `assets_access` live.
- ✅ `assets_access` seeded (110 rows, account_id backfilled) · `kb_articles.action_type` derived.
- 🟡 Remediate v2 written (with Zendesk reply) — needs a `grant_access` ticket in auto + write-scope test.
- 🟡 Escalation / Comms — partial; Escalation must also read `remediation_status='escalated'`.
- 🔴 Major-Incident · CSAT · Workbench (Command Center) — not built.
- 🟡 Orchestrator wiring — current top task.

## Next steps (ordered)
1. Confirm Zendesk **write scope**, run Remediate on a real ticket.
2. Flip `vip_always_escalate` OFF → get a `grant_access` ticket into `auto` → test the real flip end-to-end.
3. Update Escalation to fetch `remediation_status='escalated'`.
4. Wire the Orchestrator (Sweep → … → Remediate → Escalation) — one clean end-to-end batch.
5. Command Center wired to live `run_log` (dashboard KPIs move on run).
6. Then, if time: Major-Incident · CSAT.
