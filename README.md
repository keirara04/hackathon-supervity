# AIDEN — Service Desk Command Center

**Supervity Autopilot Asia Hackathon 2026 · Round 2 · Track 3 (Customer Support)**
Team: Muhammad Hakeemi (Command Center) + Amsyar Hakimi (Orchestrator + Operators on Auto)

AIDEN is an AI Employee for an IT service desk: tickets arrive from Zendesk and Outlook, get triaged, diagnosed against a knowledge base, auto-resolved where policy allows, escalated to a human where it doesn't, and rolled up into live metrics — with every policy evaluation and human decision logged for audit.

Round 1 built the resolver (2 Operators, 3 integrations). Round 2 grows it into a governed operation: 6 Operators, 11 live policy levers, a self-learning insights loop, and a full Command Center on top.

See the architecture diagram: [`docs/AIDEN_Architecture_Diagram.svg`](docs/AIDEN_Architecture_Diagram.svg)

---

## The two layers

| Layer | What it is | Built on |
|---|---|---|
| **1 — Agent Ecosystem** | Orchestrator + 6 Operators (Sweep, Triage, Diagnose & Correlate, Score & Decide, Remediate & Verify, Escalation & Change-Approval Router) that actually process tickets | [auto.supervity.ai](https://auto.supervity.ai) — owned by Amsyar |
| **2 — Command Center** | Dashboard, AI Policies, AI Insights, Workbench, Data Manager, AI Manager — everything in this repo | FastAPI + Next.js, coded here — owned by Muhammad Hakeemi |

Business data (`run_log`, `policy_config`, `policy_eval_log`, `workbench_tasks`, `triage_queue`, `kb_articles`, `incidents`, `users_directory`, `assets_access`) lives in **Supabase**, read/written by both layers over PostgREST. This repo's own Postgres/Docker database is only for the template's own auth/audit scaffolding — not where business data lives.

---

## Live integrations (floor: 3+, across 2+ categories)

| System | Category | Role |
|---|---|---|
| **Zendesk** | Channel | Ticket intake + requester replies (OAuth client-credentials → Bearer) |
| **Outlook** | Channel | Email intake + escalation notices (native Auto integration) |
| **Supabase** | System of record | Every table above, accessed via raw PostgREST calls from both the Operators and this backend |

All three are pinged live from the **Data Manager** page (`/data-manager`) — status is checked, not hardcoded.

---

## What each Command Center surface actually does

| Surface | Route | Status |
|---|---|---|
| **Dashboard** | `/` | Live KPIs computed from `run_log` on every load — auto-resolution rate, SLA compliance, MTTR, ticket volume trend, department split. Polls every 15s with a "Live" indicator; nothing seeded. |
| **AI Policies** | `/ai/policies` | All 11 real levers from `policy_config` (`vip_always_escalate`, `min_auto_score`, `min_kb_confidence`, etc.), schema-driven so new levers need no frontend changes. Edits are batched, saved, and read fresh by the Score & Decide operator on the next run. Every evaluation logged to `policy_eval_log` and shown in an audit table below. |
| **AI Insights** | `/ai/insights` | Computed from `policy_eval_log` + `run_log` + `workbench_tasks` — pattern detection (VIP-driven escalation share, KB gaps, department volume), a volume forecast, and a **self-learning** insight that reads recurring Workbench overrides and offers a one-click "apply this policy fix" action. |
| **Workbench** | `/workbench` | The human queue — every exception arrives with full context and the AI's recommendation; a person approves, modifies, or rejects. Decision is recorded and feeds the self-learning loop above. |
| **Data Manager** | `/data-manager` | Live health registry — pings Supabase, Zendesk, and Outlook and reports up/down + what each is used for. |
| **AI Manager** | chat, top bar | Grounded conversational surface — only answers from live tool calls (dashboard KPIs, workbench queue, policy config, eval log), can trigger an Auto orchestrator run. Never invents a number it can't cite. |
| **Incidents** (bonus) | `/incidents` | Major-incident detection built directly in the Command Center: groups `run_log` by `cluster_key`, flags clusters at/above `policy_config.major_incident_threshold`, and declares/links incidents — covers the "30 tickets, one failing system" scenario without waiting on a dedicated Auto operator. |
| **Triage Queue / Run Log / Knowledge Base** (bonus) | `/triage-queue`, `/run-log`, `/knowledge-base` | Read-only live views into the operators' own working tables, useful for judges to see the pipeline mid-flight. |

---

## Outcome metrics & integrations note (submission requirement)

**Metrics tracked:** MTTR, SLA compliance %, auto-resolution rate, ticket volume, department split — all computed live from `run_log` on the Dashboard (`GET /api/dashboard/kpis`), not static numbers. CSAT is modeled in the policy schema (`csat_escalate_below`) but not yet populated — the CSAT Follow-up operator is still upstream.

**Integrations used:** Zendesk (channel), Outlook (channel), Supabase (system of record) — 3 live integrations across 2 categories, all visible and health-checked in Data Manager.

**Human in the loop:** Workbench resolves real exceptions; decisions are auditable and feed back into policy recommendations via the AI Insights self-learning panel.

---

## Prerequisites

| Tool | macOS | Windows | Why you need it |
|------|-------|---------|-----------------|
| **Docker Desktop** | [Download for Mac](https://www.docker.com/products/docker-desktop/) | [Download for Windows](https://www.docker.com/products/docker-desktop/) | Runs backend, frontend, and the template's own database in containers |
| **Git** | Pre-installed or `brew install git` | [Download](https://git-scm.com/download/win) or `winget install Git.Git` | Clone the repository |

> **Windows users:** Make sure WSL 2 is enabled (Docker Desktop will prompt you). If you see a WSL error, run `wsl --install` in PowerShell as Administrator and restart.

---

## Getting started

### 1. Clone and configure

```bash
git clone <this-repo-url>
cd hackathon-supervity
cp .env.example .env   # macOS/Linux — Copy-Item .env.example .env on Windows PowerShell
```

Fill in `.env` with:
- `SUPABASE_URL` / `SUPABASE_KEY` — the business-data project (`ovtxhlpeixfjyyxqufhw`)
- `OPENROUTER_API_KEY` — powers the AI Manager chat + AI Insights
- `AUTO_WORKFLOW_API_KEY` / `AUTO_WORKFLOW_ID` / `AUTO_ORG_ID` — only needed once the Orchestrator trigger button is used from AI Manager; everything else works without it
- Zendesk credentials — only needed for the Data Manager Zendesk health check to go green

`AUTH_BYPASS=true` (default) skips real auth entirely — the app runs as an automatic "Dev User".

### 2. Start Docker Desktop, then start the services

```bash
make up                   # .\scripts\start.ps1 on Windows — first run 2-5 min, later runs ~15s
docker compose ps         # verify postgres, backend, frontend all healthy
```

### 3. Open it

| Service | URL |
|---|---|
| 🖥️ Command Center | [http://localhost:8080](http://localhost:8080) |
| ⚙️ API docs (Swagger) | [http://localhost:8001/api/docs](http://localhost:8001/api/docs) |
| 🗄️ Template's own Postgres | `localhost:5432` (user `user`, pass `password`) — auth/audit only, not business data |

---

## Common commands

| Command | What it does |
|---|---|
| `make up` | Build and start all services |
| `make down` | Stop all services |
| `make logs-be` / `make logs-fe` | Stream backend / frontend logs |
| `make lint` | Lint backend + frontend |
| `make test-be` | Run backend unit tests |
| `docker compose up --build -d backend` | Rebuild just the backend after a Python change |
| `docker compose up --build -d frontend` | Rebuild just the frontend after a `.tsx` change |

Windows equivalents and full troubleshooting live in [`docs/NEXT_STEPS.md`](docs/NEXT_STEPS.md) and the original template notes below.

---

## Project structure

```
hackathon-supervity/
├── app/                         # Backend (FastAPI)
│   ├── main.py                  # App entry point, router registration
│   ├── routers/
│   │   ├── dashboard.py         # Live KPIs from run_log
│   │   ├── policies.py          # AI Policies — schema, singleton config, eval log
│   │   ├── insights.py          # AI Insights — patterns, forecast, self-learning
│   │   ├── workbench.py         # Human-in-the-loop exception queue
│   │   ├── data_manager.py      # Live integration health checks
│   │   ├── ai.py                # AI Manager chat + Auto orchestrator trigger
│   │   ├── incidents.py         # Major-incident detection (cluster_key correlation)
│   │   ├── triage_queue.py      # Read-only view of the Triage operator's queue
│   │   ├── kb_articles.py       # Knowledge base viewer / auto-safe toggle
│   │   ├── run_log.py           # Pipeline ledger views
│   │   └── admin.py, audit.py, auth.py, items.py, examples.py, health.py  # template scaffolding
│   └── core/                    # supabase.py (PostgREST client), database.py, storage.py
├── frontend/src/app/             # Next.js pages — one per surface above
├── docs/
│   ├── AIDEN_Architecture_Diagram.svg   # ⭐ visual architecture overview
│   ├── AIDEN_Operator_Progress_Spec.md  # ⭐ real schema + per-operator build status
│   ├── AIDEN_Architecture_ASCII.md      # earlier text-form architecture notes
│   ├── NEXT_STEPS.md                    # session-by-session build log + gate checklist
│   ├── ROUND_2_FULL_REFERENCE.md        # full hackathon rules/rubric reference
│   ├── command-center-guide.md          # template's own architecture guide
│   └── hackathon-brief.md               # official Round 2 brief
├── alembic/                      # migrations for the template's own Postgres (not business data)
├── docker-compose.yml
└── .env.example
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Agent orchestration | [auto.supervity.ai](https://auto.supervity.ai) |
| Backend | Python 3.11 + FastAPI |
| Business data | Supabase (PostgreSQL via PostgREST) |
| LLM (Policies/Insights/AI Manager) | OpenRouter |
| Frontend | Next.js 15 + React 19 + Tailwind + Framer Motion |
| Containers | Docker + Docker Compose |

---

## Documentation

| Document | Purpose |
|---|---|
| [`docs/AIDEN_Architecture_Diagram.svg`](docs/AIDEN_Architecture_Diagram.svg) | Visual overview of the full agent + Command Center ecosystem |
| [`docs/AIDEN_Operator_Progress_Spec.md`](docs/AIDEN_Operator_Progress_Spec.md) | Real Supabase schema, per-operator build status, integration details |
| [`docs/NEXT_STEPS.md`](docs/NEXT_STEPS.md) | Build log, known issues, gate-requirement checklist |
| [`docs/ROUND_2_FULL_REFERENCE.md`](docs/ROUND_2_FULL_REFERENCE.md) | Full rubric, timeline, and qualification gate |
| [`docs/command-center-guide.md`](docs/command-center-guide.md) | Template's own architecture reference |
| [`docs/hackathon-brief.md`](docs/hackathon-brief.md) | Official Round 2 brief |
