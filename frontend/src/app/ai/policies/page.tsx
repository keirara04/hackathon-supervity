'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { GuideBanner } from '@/components/GuideBanner'

type LeverType = 'boolean' | 'number' | 'array' | 'text' | 'object'

interface Lever {
  key: string
  label: string
  type: LeverType
  min?: number
  max?: number
  step?: number
}

type PolicyValue = boolean | number | string | string[] | Record<string, string>

interface PolicyConfig {
  id: number
  updated_at: string
  updated_by: string
  [key: string]: unknown
}

interface EvalLogRow {
  id: number
  ticket_id: string
  run_id: string
  evaluated_at: string
  verdict: string
  policy_hits: string[] | null
  reason: string
}

interface AuditChange {
  field: string
  from: unknown
  to: unknown
}

interface AuditEntry {
  id: number
  changed_at: string
  changed_by: string | null
  changes: AuditChange[]
}

interface RosterAgent {
  agent_name: string
  agent_email: string | null
  team: string | null
  component: string | null
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

function LeverControl({
  lever,
  value,
  onChange,
}: {
  lever: Lever
  value: PolicyValue
  onChange: (v: PolicyValue) => void
}) {
  if (lever.type === 'boolean') {
    return (
      <Switch checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked)} />
    )
  }

  if (lever.type === 'number') {
    return (
      <input
        type='number'
        value={typeof value === 'number' ? value : ''}
        min={lever.min}
        max={lever.max}
        step={lever.step ?? 1}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        className='w-28 rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm outline-none focus:border-primary/50'
      />
    )
  }

  if (lever.type === 'array') {
    const arr = Array.isArray(value) ? value : []
    return (
      <input
        type='text'
        value={arr.join(', ')}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
        placeholder='comma, separated, values'
        className='w-full rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm outline-none focus:border-primary/50 sm:w-72'
      />
    )
  }

  // Object-type levers get their own dedicated section (AssignmentRoutingCard
  // below) rather than being crammed into this generic list — assignment_routing
  // is the only one today, so nothing else falls through this branch.

  return (
    <input
      type='text'
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      className='w-full rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm outline-none focus:border-primary/50 sm:w-72'
    />
  )
}

function AssignmentRoutingCard({
  lever,
  value,
  onChange,
  isDirty,
  highlighted,
  roster,
}: {
  lever: Lever
  value: PolicyValue
  onChange: (v: PolicyValue) => void
  isDirty: boolean
  highlighted: boolean
  roster: RosterAgent[]
}) {
  const obj = (typeof value === 'object' && value !== null ? value : {}) as Record<string, string>
  const entries = Object.entries(obj)
  const componentRows = entries.filter(([k]) => k !== '_default')
  const defaultEntry = entries.find(([k]) => k === '_default')

  const updateValue = (key: string, val: string) => onChange({ ...obj, [key]: val })

  const renameKey = (oldKey: string, newKey: string) => {
    newKey = newKey.trim()
    if (!newKey || newKey === oldKey || newKey in obj) return
    const next: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj)) next[k === oldKey ? newKey : k] = v
    onChange(next)
  }

  const removeRow = (key: string) => {
    const next = { ...obj }
    delete next[key]
    onChange(next)
  }

  const addRow = () => {
    let newKey = 'component'
    let i = 1
    while (newKey in obj) newKey = `component_${i++}`
    onChange({ ...obj, [newKey]: '' })
  }

  const rosterComponents = Array.from(new Set(roster.map((a) => a.component).filter(Boolean))) as string[]
  const rosterEmails = roster.filter((a) => a.agent_email)
  const rosterHasAnyEmail = rosterEmails.length > 0

  function resolveAgent(email: string): RosterAgent | undefined {
    if (!email) return undefined
    return roster.find((a) => a.agent_email?.toLowerCase() === email.toLowerCase())
  }

  const matchedCount = componentRows.filter(([, email]) => resolveAgent(email)).length

  return (
    <motion.div variants={itemVariants} id={`lever-${lever.key}`}>
      <Card
        className={cn(
          isDirty && 'ring-1 ring-primary/40',
          highlighted && 'ring-2 ring-brand-cornflower/50'
        )}
      >
        <CardHeader>
          <div className='flex items-center gap-2'>
            <CardTitle>{lever.label}</CardTitle>
            {isDirty && (
              <span className='rounded-full bg-primary/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary'>
                unsaved
              </span>
            )}
          </div>
          <CardDescription>
            {componentRows.length} routing rule{componentRows.length === 1 ? '' : 's'} · {matchedCount} matched to a real Team Roster agent
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {!rosterHasAnyEmail && (
            <div className='flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600'>
              <Icons.alertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
              <span>No Team Roster agents have an email on file yet — add emails there to enable routing matches.</span>
            </div>
          )}

          <datalist id='roster-components'>
            {rosterComponents.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <datalist id='roster-agents-emails'>
            {rosterEmails.map((a) => (
              <option key={a.agent_email} value={a.agent_email ?? ''} label={`${a.agent_name} — ${a.team ?? 'no team'}`} />
            ))}
          </datalist>

          <div className='space-y-3'>
            {componentRows.map(([k, v]) => {
              const matched = resolveAgent(v)
              return (
                <div key={k} className='rounded-lg border border-border p-3'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <div className='flex-1'>
                      <label className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>Component</label>
                      <input
                        type='text'
                        defaultValue={k}
                        onBlur={(e) => renameKey(k, e.target.value)}
                        placeholder='component'
                        title='Ticket component this routes'
                        list='roster-components'
                        className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm capitalize outline-none focus:border-primary/50'
                      />
                    </div>
                    <Icons.chevronRight className='mt-4 h-4 w-4 shrink-0 text-muted-foreground' />
                    <div className='flex-1'>
                      <label className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>Assignee email</label>
                      <input
                        type='email'
                        value={v}
                        onChange={(e) => updateValue(k, e.target.value)}
                        placeholder='assignee@company.com'
                        title='Assignee email for this component'
                        list='roster-agents-emails'
                        className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                      />
                    </div>
                    <button
                      type='button'
                      onClick={() => removeRow(k)}
                      title='Remove this routing rule'
                      className='mt-4 shrink-0 rounded p-1 text-muted-foreground hover:text-red-400'
                    >
                      <Icons.close className='h-4 w-4' />
                    </button>
                  </div>
                  <div className='mt-2'>
                    {matched ? (
                      <span className='inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500'>
                        <Icons.checkCircle className='h-3 w-3' />
                        {matched.agent_name} — {matched.team ?? 'no team'}
                      </span>
                    ) : (
                      <span className='inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600'>
                        <Icons.alertTriangle className='h-3 w-3' />
                        Not on roster
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <button
            type='button'
            onClick={addRow}
            className='flex items-center gap-1 text-xs font-medium text-primary hover:underline'
          >
            <Icons.plus className='h-3 w-3' />
            Add component
          </button>

          {defaultEntry && (
            <div className='border-t border-border pt-3'>
              <div className='flex items-center gap-2'>
                <span className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>Default (fallback)</span>
                <span className='text-[10px] text-muted-foreground'>used when no component rule matches</span>
              </div>
              <input
                type='email'
                value={defaultEntry[1]}
                onChange={(e) => updateValue('_default', e.target.value)}
                placeholder='assignee@company.com'
                className='mt-1.5 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50 sm:w-80'
              />
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

const VERDICT_STYLES: Record<string, string> = {
  auto: 'bg-emerald-500/15 text-emerald-500',
  human: 'bg-amber-500/15 text-amber-500',
}

export default function PoliciesPage() {
  return (
    <Suspense fallback={null}>
      <PoliciesPageInner />
    </Suspense>
  )
}

function PoliciesPageInner() {
  const searchParams = useSearchParams()
  const [levers, setLevers] = useState<Lever[]>([])
  const [policy, setPolicy] = useState<PolicyConfig | null>(null)
  const [draft, setDraft] = useState<Record<string, PolicyValue>>({})
  const [log, setLog] = useState<EvalLogRow[]>([])
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [roster, setRoster] = useState<RosterAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const guide = searchParams.get('guide')
  const highlight = searchParams.get('highlight')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [schemaRes, policyRes, logRes, auditRes, rosterRes] = await Promise.all([
        apiClient.get<{ levers: Lever[] }>('/api/policies/schema'),
        apiClient.get<PolicyConfig>('/api/policies'),
        apiClient.get<{ log: EvalLogRow[] }>('/api/policies/log?limit=50'),
        apiClient.get<{ entries: AuditEntry[] }>('/api/policies/audit?limit=50'),
        apiClient.get<{ agents: RosterAgent[] }>('/api/team-roster'),
      ])
      setLevers(schemaRes.levers)
      setPolicy(policyRes)
      setLog(logRes.log)
      setAuditEntries(auditRes.entries.filter((e) => e.changes.length > 0))
      setRoster(rosterRes.agents)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load policies')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!highlight || loading) return
    const el = document.getElementById(`lever-${highlight}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlight, loading])

  function setField(key: string, value: PolicyValue) {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setSavedMsg(null)
  }

  const hasChanges = Object.keys(draft).length > 0

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const updated = await apiClient.patch<PolicyConfig>('/api/policies', draft)
      setPolicy(updated)
      setDraft({})
      setSavedMsg('Saved — next agent run will read these values.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save policy changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      className='space-y-8'
      variants={containerVariants}
      initial='hidden'
      animate='visible'
    >
      <motion.div variants={itemVariants} className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>AI Policies</h1>
          <p className='mt-2 text-lg text-muted-foreground'>
            Live levers the Orchestrator reads before every decision — no code required to change them.
          </p>
        </div>
        {hasChanges && (
          <Button variant='gradient' onClick={save} disabled={saving}>
            {saving ? (
              <Icons.loader className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Icons.check className='mr-2 h-4 w-4' />
            )}
            Save changes ({Object.keys(draft).length})
          </Button>
        )}
      </motion.div>

      {error && (
        <motion.div variants={itemVariants}>
          <Card className='border-red-500/40 bg-red-500/5'>
            <CardContent className='flex items-center gap-2 py-4 text-sm text-red-400'>
              <Icons.alertTriangle className='h-4 w-4' />
              {error}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {savedMsg && (
        <motion.div variants={itemVariants}>
          <Card className='border-emerald-500/40 bg-emerald-500/5'>
            <CardContent className='flex items-center gap-2 py-4 text-sm text-emerald-400'>
              <Icons.checkCircle className='h-4 w-4' />
              {savedMsg}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <GuideBanner guide={guide} />

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Policy Levers</CardTitle>
            <CardDescription>
              {policy && `Last updated ${new Date(policy.updated_at).toLocaleString()} by ${policy.updated_by}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className='py-8 text-center text-sm text-muted-foreground'>Loading...</p>
            ) : (
              <div className='divide-y divide-border'>
                {levers
                  .filter((lever) => lever.type !== 'object')
                  .map((lever) => {
                    const current = draft[lever.key] ?? (policy?.[lever.key] as PolicyValue)
                    const isDirty = lever.key in draft
                    return (
                      <div
                        key={lever.key}
                        id={`lever-${lever.key}`}
                        className={cn(
                          'flex flex-wrap items-center justify-between gap-4 py-4',
                          isDirty && 'rounded-lg bg-primary/5 px-3',
                          highlight === lever.key && 'rounded-lg bg-brand-cornflower/10 px-3 ring-2 ring-brand-cornflower/50'
                        )}
                      >
                        <div>
                          <p className='text-sm font-medium'>{lever.label}</p>
                          <p className='text-xs text-muted-foreground'>{lever.key}</p>
                        </div>
                        <div className='flex items-center gap-2'>
                          {isDirty && (
                            <span className='rounded-full bg-primary/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary'>
                              unsaved
                            </span>
                          )}
                          <LeverControl
                            lever={lever}
                            value={current}
                            onChange={(v) => setField(lever.key, v)}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {!loading &&
        levers
          .filter((lever) => lever.type === 'object')
          .map((lever) => (
            <AssignmentRoutingCard
              key={lever.key}
              lever={lever}
              value={draft[lever.key] ?? (policy?.[lever.key] as PolicyValue)}
              onChange={(v) => setField(lever.key, v)}
              isDirty={lever.key in draft}
              highlighted={highlight === lever.key}
              roster={roster}
            />
          ))}

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Evaluation Log</CardTitle>
            <CardDescription>Every policy evaluation the Orchestrator has run, most recent first.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Mobile: stacked cards, no horizontal scrolling */}
            <div className='space-y-3 sm:hidden'>
              {log.map((row) => (
                <div key={row.id} className='rounded-lg border border-border p-3'>
                  <div className='flex items-center justify-between'>
                    <span className='font-medium'>{row.ticket_id}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        VERDICT_STYLES[row.verdict] ?? 'bg-muted text-muted-foreground'
                      )}
                    >
                      {row.verdict}
                    </span>
                  </div>
                  <p className='mt-1.5 text-sm text-muted-foreground'>{row.reason}</p>
                  {(row.policy_hits ?? []).length > 0 && (
                    <div className='mt-1.5 flex flex-wrap gap-1'>
                      {(row.policy_hits ?? []).map((hit) => (
                        <span key={hit} className='rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground'>
                          {hit}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className='mt-1.5 text-xs text-muted-foreground'>{new Date(row.evaluated_at).toLocaleString()}</p>
                </div>
              ))}
              {log.length === 0 && !loading && (
                <p className='py-8 text-center text-sm text-muted-foreground'>No evaluations logged yet.</p>
              )}
            </div>

            {/* Desktop/tablet: full table */}
            <div className='hidden overflow-x-auto sm:block'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground'>
                    <th className='pb-2 pr-4'>Ticket</th>
                    <th className='pb-2 pr-4'>Verdict</th>
                    <th className='pb-2 pr-4'>Reason</th>
                    <th className='pb-2 pr-4'>Policy hits</th>
                    <th className='pb-2'>When</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((row) => (
                    <tr key={row.id} className='border-b border-border/50'>
                      <td className='py-2 pr-4 font-medium'>{row.ticket_id}</td>
                      <td className='py-2 pr-4'>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            VERDICT_STYLES[row.verdict] ?? 'bg-muted text-muted-foreground'
                          )}
                        >
                          {row.verdict}
                        </span>
                      </td>
                      <td className='py-2 pr-4 text-muted-foreground'>{row.reason}</td>
                      <td className='py-2 pr-4 text-xs text-muted-foreground'>
                        {(row.policy_hits ?? []).join(', ') || '—'}
                      </td>
                      <td className='py-2 text-xs text-muted-foreground'>
                        {new Date(row.evaluated_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {log.length === 0 && !loading && (
                <p className='py-8 text-center text-sm text-muted-foreground'>No evaluations logged yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Change History</CardTitle>
            <CardDescription>Every edit made to these levers — who, when, and what changed.</CardDescription>
          </CardHeader>
          <CardContent className='divide-y divide-border'>
            {auditEntries.map((entry) => (
              <div key={entry.id} className='py-3'>
                <div className='flex items-center justify-between text-xs text-muted-foreground'>
                  <span>{entry.changed_by ?? 'unknown'}</span>
                  <span>{new Date(entry.changed_at).toLocaleString()}</span>
                </div>
                <div className='mt-1.5 space-y-1'>
                  {entry.changes.map((change) => (
                    <p key={change.field} className='text-sm'>
                      <span className='font-mono text-xs text-muted-foreground'>{change.field}</span>:{' '}
                      <span className='text-red-400'>{JSON.stringify(change.from)}</span>
                      {' → '}
                      <span className='text-emerald-500'>{JSON.stringify(change.to)}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
            {auditEntries.length === 0 && !loading && (
              <p className='py-8 text-center text-sm text-muted-foreground'>No changes recorded yet.</p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
