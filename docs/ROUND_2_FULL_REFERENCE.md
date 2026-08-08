# Supervity Autopilot Asia Hackathon 2026 — Full Reference

## Team & Track

- **Team:** Keira (3rd-year CS/CE student) + Amsyar Hakimi. Two-person team, first hackathon.
- **Stack:** Next.js, React, Tailwind, FastAPI, Supabase, Docker.
- **Track:** Track 3, Customer Support — Round 1 "The Stalled-Ticket Resolver" → Round 2 "The Service Desk Command Center." Track is fixed and does not change between rounds.
- **Division of labor:** Amsyar owns the Orchestrator + Operators on auto.supervity.ai. Keira owns the entire coded Command Center (backend + frontend).

---

## Round 1 recap (context for Round 2)

- Sprint: 18–20 July 2026 MYT, 48-hour online build. Problem statements released 17 Jul 6PM MYT.
- Scenario: IT service desk lead (Arjun) with stalled/at-risk tickets breaching SLA.
- Requirements: Orchestrator + 2+ Operator Agents (not a single mega-agent); min 3 live integrations across 2 categories (1 channel + 1 system of record); at least 1 live exception routed to Auto Workbench.
- Data (Issues, Users_Directory, Assets_Access, Knowledge_Base, Field_Dictionary CSVs) had to flow through live integrations, not be read directly from file.
- Judged live on a hidden/unseen dataset, not the sample rows.
- Judging weights: Business output 40%, Customizability 20%, Technical architecture 20%, Demo 20%.
- Two integration paths allowed: native Auto connector, or a code-built API Operator (Auto generates code, can call any app's API directly) — must still map to a defined integration category.
- Google integrations (Drive, Sheets, Gmail, Calendar) in beta — use Airtable, Supabase, SharePoint, OneDrive, Box, Dropbox, Outlook instead. Microsoft Teams not permitted.
- Result: team advanced to Round 2 (finalist).

---

## Round 2 — the goal, in one sentence

Take the Round 1 agent and grow it into a **governed operation**: more Operators doing more of the real job, a Command Center that shows what's happening, policies a person can change, insights the agent's data surfaces, and a human queue for decisions the agent shouldn't make alone. Round 1 tested decomposition; Round 2 tests governance and completeness.

### The two mandatory layers

- **Layer 1 — the agent.** Runs entirely on Supervity Auto. One Orchestrator coordinating **at least 5 distinct Operator Agents** (up from 2+ in Round 1). All orchestration must be built on Auto — no exceptions, no LangChain/CrewAI/standalone LLM orchestration for this layer.
- **Layer 2 — the Command Center.** Coded on the official template repo. Dashboard, AI Policies engine, AI Insights, AI Manager chat, Data Manager, Workbench. **Any LLM allowed here** (Claude, GPT, Gemini, open source) since this layer isn't on Auto.
- Round 1's Orchestrator/Operators are **not thrown away** — extend to 5+, don't rebuild from scratch. Building fresh agents on Auto is allowed if preferred, but not required.

---

## The template repository

**`https://github.com/digitamizers/AutoPilot-Template`** — mandatory starting point for every team, so judges can run every build the same way.

**Backend:** FastAPI with auto-generated Swagger docs (`localhost:8001/api/docs`), PostgreSQL + Alembic migrations, auth with a development bypass (`AUTH_BYPASS=true` → automatic "Dev User" session, no real auth needed — real auth is a bonus, not a requirement), audit-logging middleware on every request, a sample CRUD API (`items`), a file-storage API, role-based authorization engine.

**Frontend:** Next.js + React Command Center (`localhost:3001`) — dashboard with stat cards + activity chart, AI Policies page (ships with demo data), AI Insights page (demo data), AI Manager chat interface, Workbench page (interface shell), settings page, command palette.

**Setup:**
```
git clone https://github.com/digitamizers/AutoPilot-Template
cd AutoPilot-Template
cp .env.example .env      # macOS/Linux; Copy-Item .env.example .env on Windows PowerShell
# start Docker Desktop, wait until running
make up                   # .\scripts\start.ps1 on Windows — first run 2-5 min, later runs ~15s
docker compose ps         # verify postgres, backend, frontend all healthy
```
DB creds: `localhost:5432`, user `user`, pass `password`.

**Connecting the Command Center to Auto:**
- Generate a Workflow API key at `https://auto.supervity.ai/u/api-keys` — choose expiration + workspace context, copy the token, store in `.env`, never commit, never expose to frontend (browser code is public).
- Call `POST https://auto.supervity.ai/api/v1/workflow-runs/execute/stream` (or `/execute` for blocking) with the key as a Bearer token, plus `x-active-org` header, plus `x-source: external` (required for Custom API Keys).
- Full Auto API docs: `https://auto.supervity.ai/docs` — authoritative reference for calling an Operator from code.
- Persist everything (runs, decisions, policy evaluations, exceptions) to the database — the audit-logging middleware is already there, use it.
- **Fail safely.** If an Operator fails or a field is missing, pause and route to the Workbench. Never crash, never invent a value.
- The template's own backend/database does **not** count as one of your 3 required integrations — those must be genuinely external systems (channel, CRM, ticket tool, database).

**Shipping the template's demo data as if it were real output is an automatic fail** — judges check the Policies and Insights pages against data the agent actually processed.

---

## What each Command Center surface must actually do

- **Dashboard** — the live operational picture: headline metrics, agent status, open exception queues, whatever a leader in that role checks first each morning. Numbers must move as the agent works.
- **AI Policies engine** — at least 3 active policies that genuinely constrain what the agent may do alone, evaluated **before** an action executes (not reported afterward). A business user must be able to change a threshold/rule in the interface with **no code**, and see the agent behave differently on the next run. Every evaluation logged for traceability. Can be deterministic rules or natural language evaluated by a model — either counts, as long as it actually gates the action.
- **AI Insights engine** — patterns a person wouldn't assemble by hand, computed from data the agent actually processed (not static/seeded). Must carry a severity and end in a clear action path. Two useful kinds: operational insights (recurring anomalies, risk clusters, forecasts) and automation-opportunity insights (a manual step recurring often enough to deserve a policy or new Operator).
- **AI Manager** — conversational surface; a person asks a question in plain language, gets an answer grounded in real records, can trigger/re-trigger an Operator from the same place. Must never invent an answer it can't support from the data. Not a general chatbot.
- **Data Manager** — live registry of every connected system, what each is used for, and whether the connection is healthy. How a judge sees your integrations are real.
- **Workbench** — the human queue. Every item arrives with full context and the agent's recommendation. A person approves, modifies, or rejects; the decision is recorded; the workflow continues from there. If a human correction also changes future behavior, that's the self-learning bonus.

---

## Business functions worth adding (Track 3, Customer Support — pick some, not all)

- Major-incident detection & comms — detect a flood of related tickets, open a parent incident, run comms until it closes.
- Change approval — request/track approval a fix needs before touching production.
- Rollback and verification — verify a remediation worked, roll back cleanly if not.
- Knowledge-base authoring — write an article from a resolved ticket so the next identical request deflects itself.
- CSAT follow-up — survey the requester after resolution, escalate a poor score to a human.
- Load balancing / on-call routing — assign work by team capacity, shift, on-call roster rather than round robin.

---

## The Round 2 problem statement (Track 3 — "The Service Desk Command Center")

**Outcome metrics:** MTTR, SLA compliance, auto-resolution rate, CSAT.

**Scenario:** Arjun runs a full IT service desk taking work from email, chat, and a portal. SLAs respect business hours and holidays. Teams depend on each other to close anything. The build must handle: 30 tickets landing in 20 minutes all tracing to one failing system (a major incident hiding in a flood of tickets); a VIP request stalling after hours, minutes from breach; a quick fix needing change approval before anyone may touch production; a remediation that fails and must be rolled back cleanly.

**Example flow (not a required design):** Ticket arrives → Backend API → Orchestrator → AI Policies → Resolved. Example Operators: SLA Triage, Diagnose & Correlate, Major-Incident Detector, Remediate, Requester Comms, Knowledge-Base Updater. Exception path: → Workbench → AI Insights → Command Center. The Orchestrator prioritizes by SLA risk, branches on whether a fix is safe to automate, holds state to link related tickets into one incident.

---

## Bring your own systems / integrations

- Teams provision their own accounts/integrations — no hosted Supervity accounts.
- Connect via native Auto integration or a code-built API Operator.
- **Floor: at least 3 live integrations across at least 2 categories**, including 1 channel and 1 system of record, all visible and healthy in the Data Manager.
- Google integrations (Drive, Sheets, Gmail, Calendar) in beta — use Airtable, Supabase, SharePoint, OneDrive, Box, Dropbox, or Outlook.
- An integration that's connected but unused, or a Data Manager entry that's hardcoded, doesn't count toward the floor.

---

## The dataset

- Round 2 ships an expanded pack per track — keeps the Round 1 schema (so existing builds still read it), adds new tables/columns/volume/harder cases.
- Track 3 additions: **Ticket_Comments, CSAT_Surveys, Change_Requests, Incident_Problem_Links, SLA_Calendar, Team_Roster** — six new tables, ~1,200 rows total across the whole pack.
- Do not hardcode to given rows — a judge may ask you to run a record you didn't prepare, or ask how the build behaves when data/rules change.
- Datasets are for this hackathon only, may not be redistributed.

---

## Timeline

| Date | Event |
|---|---|
| 25 Jul | Round 2 brief + template repository released |
| 26–27 Jul | Prep window — set up environment, clone template, plan Operators |
| 3–7 Aug | **Remote build (5 days)** |
| 8 Aug | Offline build at APU Kuala Lumpur. Check-in 10:00–10:45. Code freeze **11:59 PM — no commits accepted after** |
| 9 Aug | Grand Finale at APU. Check-in 10:00–10:45, 15 min setup, judging 11:00–16:30 (lunch 13:00–14:00), showcase slot **10–12 min** (~8–10 min live demo + 2–3 min Q&A), judges finish scoring 16:30–17:00, keynote 17:00–17:30, prize ceremony 17:30–19:00 |

**Submission requires:** team name/members, assigned track, link to Auto workspace (for judges to verify Orchestrator/Operators are real), the Command Center repository, a running instance reachable during the demo, a short note on the outcome metric moved + integrations used.

**Note (as of Aug 7, unconfirmed):** Round 2's guide describes *what* a submission consists of but does not mention a specific submission portal/procedure the way Round 1 did. Given the in-person Grand Finale structure, submission may be presented live rather than through an upload portal — **this should be confirmed via Discord**, since Discord is the single source of truth and this detail may be pinned there separately.

**Build must run from a clean clone** — judges will not debug your machine. Test this before the freeze.

---

## The qualification gate (checked first, pass/fail, before any scoring)

A judgement call, not a checklist:
1. Solves the business problem end to end, not one fragment.
2. A human is genuinely in the loop — enough context to decide, and that decision completes the workflow.
3. Connected to real systems — live integrations, not a closed demo.
4. Ties to the real world and works live — runnable and explainable in front of a judge.

**Separately, Round 2 requires (not optional, assumed by the rubric):**
- Orchestrator on Auto coordinating 5+ distinct Operators.
- Command Center wired to that agent through the backend API, showing live activity — not the template's demo data.
- At least 3 AI Policies, editable without code, applied before the agent acts.
- AI Insights generated from data the agent actually processed.
- At least 3 live integrations across 2 categories (1 channel + 1 system of record), visible in the Data Manager.
- A Workbench where a real exception is cleared by a human.

---

## The rubric (100 points + up to 10 bonus)

| Criterion | Weight | Point split |
|---|---|---|
| Business output | 30 | Solves core problem 15 · quantified metric movement 10 · exception/edge handling 5 |
| Architecture on Auto | 20 | 5+ real Operators decomposition 8 · orchestration depth 7 · integration realism/Data Manager 5 |
| Customizability & Policies | 20 | Applied before agent acts 8 · live no-code configurability 7 · auditability/breadth 5 |
| AI Insights | 15 | From real processed data 6 · non-trivial+correct+severity 5 · actionable next step 4 |
| Command Center & live demo | 15 | Live dashboard 6 · grounded AI Manager 4 · coherent end-to-end run 5 |
| **Total** | **100** | Bonus additive on top, up to +10 |

**Bonus (+10, additive):** extra Operators / richer downstream actions, forecasting, self-learning where a Workbench override changes future behavior, deeper auditability, meaningful named open-source use (not a token import), genuine creativity beyond the brief.

**Presentation polish is explicitly NOT a scoring dimension** — judges score the live trace, not the slides. Judges may test with a record the team didn't prepare and ask the team to explain their own architecture. Per-track enterprise judges score their own domain.

**A useful test for whether Operator decomposition is real:** if you deleted one Operator, would a specific business capability disappear? If no, it was split for appearances, not architecture.

---

## Common failure modes (from the guide's own FAQ — what costs teams points)

- Shipping the template's demo data on the Policies or Insights pages.
- A dashboard that doesn't move when the agent runs.
- Policies that display but don't actually gate anything.
- An exception path that was never demonstrated live.
- Hardcoding to a few chosen rows so nothing works when a judge asks for a different case.

---

## Originality, conduct, and support

- All work must be created during the hackathon window. Reusing your own Round 1 build is expected and encouraged.
- Building with AI assistance is expected — what's judged is the resulting AI Employee and the operation around it.
- Teams retain IP ownership; Supervity gets a license to feature submissions in case studies with attribution.
- Standard code of conduct across Discord, channels, submissions, and in person at APU.
- Daily office hours run in Discord throughout the build; every official ruling is posted and pinned.
- **Discord is the single source of truth** — where this document and a live Discord announcement differ, Discord wins, because it's more recent.
