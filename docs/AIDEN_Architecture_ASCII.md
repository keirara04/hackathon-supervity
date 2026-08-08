# AIDEN — Simplified Architecture (ASCII)

One line per node = what it actually does. `[✓]` built · `[~]` partial · `[ ]` not built.

```
        ┌────────────────────────────┐
        │ TRIGGER                    │
        │ Zendesk · Outlook · chat   │  new/updated ticket arrives on a live channel
        └────────────────────────────┘
                       │
                       ▼
        ┌────────────────────────────┐
        │ ORCHESTRATOR           [~] │  runs the batch, calls operators by name,
        │ reads policy once/batch    │  passes context, retries, aggregates to run_log
        └────────────────────────────┘
                       │
                       ▼
        ┌────────────────────────────┐
        │ 1 · SWEEP / INTAKE     [✓] │  re-sweeps all unresolved tickets, normalizes
        │ all channels -> 1 queue    │  every channel into one 12-key payload
        └────────────────────────────┘
                       │
                       ▼
        ┌────────────────────────────┐
        │ 2 · TRIAGE             [✓] │  resolves requester to a real account, sets VIP +
        │ identity · SLA · rank      │  SLA hours, ranks queue, tags cluster_key
        └────────────────────────────┘
                       │
                       ▼
        ┌────────────────────────────┐        ┌────────────────────────────┐
        │ 3 · DIAGNOSE & CORRELATE[✓]│╌╌╌╌╌╌▶ │ 4 · MAJOR-INCIDENT CMD  [ ] │  groups a flood into one parent
        │ KB match + confidence      │        │ 1 parent, freeze children  │  incident, freezes children
        └────────────────────────────┘        └────────────────────────────┘  (only if cluster >= N)
                       │
                       ▼
        ┌────────────────────────────┐
        │ 5 · SCORE & DECIDE     [✓] │  scores the ticket against live policy and
        │ auto_score -> pick path    │  picks the path: auto or human
        └────────────────────────────┘
                       │
        ┌──────────────┴───────────────────────────┐
   auto ▸│                                          │◂ human
        ▼                                           ▼
┌────────────────────────────┐          ┌────────────────────────────┐
│ 6 · REMEDIATE & VERIFY  [~]│          │ 8 · ESCALATE & APPROVE  [~]│  routes the ticket to the right
│ flip grant / send steps,   │          │ route to owner · approval  │  owner + change approval, into
│ verify, reply, then close  │          │ (Supabase + Outlook)       │  the Workbench
└────────────────────────────┘          └────────────────────────────┘
   grant_access -> flips assets_access               │
   Pending->Active, re-reads to verify,               ▼
   replies in Zendesk before done      ┌────────────────────────────┐
        │                              │ WORKBENCH (human)       [ ] │  a person approves, edits, or
        │  (reply built into 6)        │ approve · edit · reject    │  rejects, decision recorded
        ▼                              └────────────────────────────┘
┌────────────────────────────┐                       │
│ 7 · REQUESTER COMMS     [~]│                       │
│ reply on same channel      │  tells the requester  │
│ (merged into 6 for auto)   │  exactly what was done │
└────────────────────────────┘                       │
        │                                             │
        ▼                                             │
┌────────────────────────────┐                        │
│ 9 · CSAT FOLLOW-UP      [ ]│  surveys the requester │
│ survey · reopen if low     │  and reopens on a low  │
└────────────────────────────┘  score                 │
        │                                              │
        └───────────────────────┬──────────────────────┘
                                 │
                                 ▼
                ┌────────────────────────────┐
                │ SUMMARY -> run_log      [✓]│  writes one consolidated record per ticket
                │ MTTR · SLA% · auto · CSAT  │  that feeds every outcome metric
                └────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────┐
│ COMMAND CENTER (coded, wraps the whole flow)                              [ ]      │  the operational UI: live dashboard,
│ Policy engine · Workbench · Data Manager · Insights · AI Manager                  │  editable policies, human queue,
└──────────────────────────────────────────────────────────────────────────────────┘  insights, all wired to run_log
```

## Legend
- `[✓]` Sweep · Triage · Diagnose · Score & Decide · Summary→run_log — built & verified.
- `[~]` Orchestrator wiring · Remediate v2 (needs grant_access test + Zendesk write scope) · Escalation/Comms (partial; Escalation must also read `remediation_status='escalated'`).
- `[ ]` Major-Incident · CSAT · Workbench · Command Center — not built.

## Two things the diagram hides (worth knowing)
- **Comms for the auto path is merged into node 6** — Remediate replies in Zendesk *before* marking done, so "done" means resolved AND notified.
- **Node 8 must pick up two sources** — `verdict='human'` (from Decide) AND `remediation_status='escalated'` (from Remediate's fail-closed cases), or escalated auto-tickets never reach a human.
