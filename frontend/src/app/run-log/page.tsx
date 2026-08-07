'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'

interface RunMetric {
  run_id: string
  run_started_at: string
  tickets_processed: number
  auto_resolved: number
  human_resolved: number
  awaiting_human: number
  failed: number
  auto_resolution_pct: number
  avg_mttr_minutes: number | null
  sla_risk_pct_before: number
  sla_risk_pct_after: number
}

interface RunLogTicket {
  id: number
  ticket_id: string
  run_id: string
  path: string | null
  verdict: string | null
  department: string | null
  category: string | null
  diagnosis: string | null
  mttr_minutes: number | null
  entered_at: string
  resolved_at: string | null
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

const PATH_STYLES: Record<string, string> = {
  auto: 'bg-emerald-500/15 text-emerald-500',
  human: 'bg-amber-500/15 text-amber-500',
  pending: 'bg-muted text-muted-foreground',
}

export default function RunLogPage() {
  const [runs, setRuns] = useState<RunMetric[]>([])
  const [tickets, setTickets] = useState<RunLogTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pathFilter, setPathFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [runsRes, ticketsRes] = await Promise.all([
        apiClient.get<{ runs: RunMetric[] }>('/api/run-log/runs'),
        apiClient.get<{ tickets: RunLogTicket[] }>('/api/run-log/tickets?limit=200'),
      ])
      setRuns(runsRes.runs)
      setTickets(ticketsRes.tickets)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load run log')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filteredTickets = pathFilter === 'all' ? tickets : tickets.filter((t) => t.path === pathFilter)

  return (
    <motion.div className='space-y-8' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex items-center justify-between'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>Run Log</h1>
          <p className='mt-2 text-lg text-muted-foreground'>The full pipeline ledger — every run and every ticket it touched.</p>
        </div>
        <Button variant='outline' size='sm' onClick={load} disabled={loading}>
          <Icons.refresh className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </Button>
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

      <motion.div variants={itemVariants}>
        <h2 className='mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground'>Runs</h2>
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
          {runs.map((run) => (
            <Card key={run.run_id}>
              <CardHeader className='pb-2'>
                <CardTitle className='truncate text-sm font-mono'>{run.run_id.slice(0, 8)}</CardTitle>
                <CardDescription>{new Date(run.run_started_at).toLocaleString()}</CardDescription>
              </CardHeader>
              <CardContent className='space-y-2'>
                <div className='flex items-center justify-between text-sm'>
                  <span className='text-muted-foreground'>Processed</span>
                  <span className='font-semibold'>{run.tickets_processed}</span>
                </div>
                <div className='flex items-center gap-2 text-xs'>
                  <span className='rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-500'>{run.auto_resolved} auto</span>
                  <span className='rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-500'>{run.human_resolved} human</span>
                  <span className='rounded-full bg-muted px-2 py-0.5 text-muted-foreground'>{run.awaiting_human} waiting</span>
                </div>
                <div className='flex items-center justify-between text-xs text-muted-foreground'>
                  <span>Avg MTTR</span>
                  <span>{run.avg_mttr_minutes !== null ? `${run.avg_mttr_minutes.toFixed(0)}m` : 'n/a'}</span>
                </div>
                <div className='flex items-center justify-between text-xs text-muted-foreground'>
                  <span>SLA risk</span>
                  <span>
                    {run.sla_risk_pct_before}% → {run.sla_risk_pct_after}%
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {!loading && runs.length === 0 && (
          <Card>
            <CardContent className='py-8 text-center text-sm text-muted-foreground'>No runs recorded yet.</CardContent>
          </Card>
        )}
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <div className='flex items-center justify-between'>
              <CardTitle>Tickets</CardTitle>
              <div className='flex gap-2'>
                {['all', 'auto', 'human', 'pending'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPathFilter(p)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors',
                      pathFilter === p
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border bg-muted/10 text-muted-foreground hover:bg-muted/20'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground'>
                    <th className='pb-2 pr-4'>Ticket</th>
                    <th className='pb-2 pr-4'>Path</th>
                    <th className='pb-2 pr-4'>Department</th>
                    <th className='pb-2 pr-4'>Category</th>
                    <th className='pb-2 pr-4'>Diagnosis</th>
                    <th className='pb-2 pr-4'>MTTR</th>
                    <th className='pb-2'>Entered</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((t) => (
                    <tr key={t.id} className='border-b border-border/50'>
                      <td className='py-2 pr-4 font-medium'>{t.ticket_id}</td>
                      <td className='py-2 pr-4'>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            PATH_STYLES[t.path ?? ''] ?? 'bg-muted text-muted-foreground'
                          )}
                        >
                          {t.path ?? 'unknown'}
                        </span>
                      </td>
                      <td className='py-2 pr-4 text-muted-foreground'>{t.department ?? '—'}</td>
                      <td className='py-2 pr-4 text-muted-foreground'>{t.category ?? '—'}</td>
                      <td className='max-w-xs truncate py-2 pr-4 text-muted-foreground'>{t.diagnosis ?? '—'}</td>
                      <td className='py-2 pr-4 text-muted-foreground'>{t.mttr_minutes ?? '—'}</td>
                      <td className='py-2 text-xs text-muted-foreground'>{new Date(t.entered_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTickets.length === 0 && !loading && (
                <p className='py-8 text-center text-sm text-muted-foreground'>No tickets match this filter.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
