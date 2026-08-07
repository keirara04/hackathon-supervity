'use client'

import { useEffect, useState, useCallback } from 'react'
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

  if (lever.type === 'object') {
    const text = typeof value === 'object' && value !== null ? JSON.stringify(value, null, 0) : '{}'
    return (
      <input
        type='text'
        defaultValue={text}
        onBlur={(e) => {
          try {
            onChange(JSON.parse(e.target.value))
          } catch {
            // ignore invalid JSON until corrected
          }
        }}
        className='w-full rounded-lg border border-border bg-muted/10 px-3 py-1.5 font-mono text-xs outline-none focus:border-primary/50 sm:w-72'
      />
    )
  }

  return (
    <input
      type='text'
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      className='w-full rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm outline-none focus:border-primary/50 sm:w-72'
    />
  )
}

const VERDICT_STYLES: Record<string, string> = {
  auto: 'bg-emerald-500/15 text-emerald-500',
  human: 'bg-amber-500/15 text-amber-500',
}

export default function PoliciesPage() {
  const [levers, setLevers] = useState<Lever[]>([])
  const [policy, setPolicy] = useState<PolicyConfig | null>(null)
  const [draft, setDraft] = useState<Record<string, PolicyValue>>({})
  const [log, setLog] = useState<EvalLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [schemaRes, policyRes, logRes] = await Promise.all([
        apiClient.get<{ levers: Lever[] }>('/api/policies/schema'),
        apiClient.get<PolicyConfig>('/api/policies'),
        apiClient.get<{ log: EvalLogRow[] }>('/api/policies/log?limit=50'),
      ])
      setLevers(schemaRes.levers)
      setPolicy(policyRes)
      setLog(logRes.log)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load policies')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
                {levers.map((lever) => {
                  const current = draft[lever.key] ?? (policy?.[lever.key] as PolicyValue)
                  const isDirty = lever.key in draft
                  return (
                    <div
                      key={lever.key}
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-4 py-4',
                        isDirty && 'rounded-lg bg-primary/5 px-3'
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
    </motion.div>
  )
}
