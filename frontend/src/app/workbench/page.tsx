'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatTimestamp } from '@/lib/format'
import { useWorkbenchQueue, useSearchFilter, type WorkbenchTask } from '@/hooks'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

const SLA_STYLES: Record<string, string> = {
  Breached: 'bg-red-500/15 text-red-400',
  'At Risk': 'bg-amber-500/15 text-amber-400',
  OK: 'bg-emerald-500/15 text-emerald-500',
}

const DECISION_LABEL: Record<string, string> = {
  approve: 'Approved',
  edit: 'Modified',
  reject: 'Rejected',
}

const DECISION_STYLES: Record<string, string> = {
  approve: 'bg-emerald-500/15 text-emerald-500',
  edit: 'bg-brand-cornflower/15 text-brand-cornflower',
  reject: 'bg-red-500/15 text-red-400',
}

function contextValue(context: Record<string, unknown>, key: string): string {
  const v = context?.[key]
  if (v === undefined || v === null) return '—'
  return String(v)
}

function policyHits(context: Record<string, unknown>): string[] {
  const hits = context?.['policy_hits']
  return Array.isArray(hits) ? hits.map(String) : []
}

function statusBadge(task: WorkbenchTask) {
  if (task.human_decision) {
    return (
      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', DECISION_STYLES[task.human_decision] ?? 'bg-muted text-muted-foreground')}>
        {DECISION_LABEL[task.human_decision] ?? task.status}
      </span>
    )
  }
  return (
    <span className='rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500'>
      Open
    </span>
  )
}

export default function WorkbenchPage() {
  const { tasks, history, loading, error, reload } = useWorkbenchQueue()
  const [tab, setTab] = useState<'open' | 'history'>('open')
  const [detail, setDetail] = useState<WorkbenchTask | null>(null)

  const activeList = tab === 'open' ? tasks : history
  const { query, setQuery, filtered } = useSearchFilter(
    activeList,
    (t) => `${t.task_id} ${t.task_type} ${contextValue(t.context, 'resolved_customer_name')} ${contextValue(t.context, 'escalation_reason')}`
  )

  return (
    <motion.div className='space-y-8' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>Workbench</h1>
          <p className='mt-2 text-lg text-muted-foreground'>
            Exceptions the AI Employee couldn&apos;t resolve alone — a monitoring view. Decisions are made in Auto&apos;s Workbench.
          </p>
        </div>
        <Button variant='outline' size='sm' onClick={reload} disabled={loading}>
          <Icons.refresh className={cn('sm:mr-2 h-4 w-4', loading && 'animate-spin')} />
          <span className='hidden sm:inline'>Refresh</span>
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

      <motion.div variants={itemVariants} className='flex flex-wrap items-center gap-3'>
        <div className='relative flex-1 sm:max-w-sm'>
          <Icons.search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search task, customer, reason...'
            className='w-full rounded-full border border-border bg-muted/10 py-2 pl-9 pr-4 text-sm outline-none focus:border-primary/50'
          />
        </div>
        <div className='flex gap-2'>
          {(['open', 'history'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium capitalize transition-colors',
                tab === t
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border bg-muted/10 text-muted-foreground hover:bg-muted/20'
              )}
            >
              {t} ({t === 'open' ? tasks.length : history.length})
            </button>
          ))}
        </div>
      </motion.div>

      {loading ? (
        <Card className='p-6'>
          <div className='space-y-3'>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className='h-12 w-full' />
            ))}
          </div>
        </Card>
      ) : (
        <ErrorBoundary>
          <motion.div variants={itemVariants}>
            <Card>
              <CardHeader>
                <CardTitle>{tab === 'open' ? 'Open exceptions' : 'Decision history'}</CardTitle>
                <CardDescription>
                  {tab === 'open'
                    ? 'Waiting on a human decision — made in Auto’s Workbench, mirrored here once recorded.'
                    : 'Approved, modified, or rejected items — decision, resolver, and timestamp.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Mobile: stacked cards */}
                <div className='space-y-3 sm:hidden'>
                  {filtered.map((task) => (
                    <div
                      key={task.task_id}
                      onClick={() => setDetail(task)}
                      className='cursor-pointer rounded-lg border border-border p-3 hover:bg-muted/10'
                    >
                      <div className='flex items-center justify-between'>
                        <span className='font-medium'>
                          {task.task_id}
                          {task.enrichment?.is_vip && (
                            <span className='ml-2 rounded-full bg-brand-purple/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-purple'>
                              VIP
                            </span>
                          )}
                        </span>
                        {statusBadge(task)}
                      </div>
                      <p className='mt-1.5 text-sm text-muted-foreground'>
                        {contextValue(task.context, 'resolved_customer_name')} · {contextValue(task.context, 'escalation_reason')}
                      </p>
                      <div className='mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                        <span>{task.task_type}</span>
                        {task.enrichment?.sla_state_before && (
                          <span className={cn('rounded-full px-2 py-0.5', SLA_STYLES[task.enrichment.sla_state_before] ?? 'bg-muted')}>
                            {task.enrichment.sla_state_before}
                          </span>
                        )}
                        <span>· {formatTimestamp(tab === 'open' ? task.created_at : task.decided_at)}</span>
                      </div>
                    </div>
                  ))}
                  {filtered.length === 0 && (
                    <p className='py-8 text-center text-sm text-muted-foreground'>
                      {tab === 'open' ? 'Queue is clear — no exceptions waiting.' : 'No decisions recorded yet.'}
                    </p>
                  )}
                </div>

                {/* Desktop/tablet: table */}
                <div className='hidden overflow-x-auto sm:block'>
                  <table className='w-full text-sm'>
                    <thead>
                      <tr className='border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground'>
                        <th className='pb-2 pr-4'>Task</th>
                        <th className='pb-2 pr-4'>Type</th>
                        <th className='pb-2 pr-4'>Customer / Reason</th>
                        <th className='pb-2 pr-4'>SLA</th>
                        <th className='pb-2 pr-4'>Status</th>
                        <th className='pb-2'>{tab === 'open' ? 'Created' : 'Decided'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((task) => (
                        <tr
                          key={task.task_id}
                          onClick={() => setDetail(task)}
                          className='cursor-pointer border-b border-border/50 hover:bg-muted/10'
                        >
                          <td className='py-2 pr-4 font-medium'>
                            {task.task_id}
                            {task.enrichment?.is_vip && (
                              <span className='ml-2 rounded-full bg-brand-purple/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-purple'>
                                VIP
                              </span>
                            )}
                          </td>
                          <td className='py-2 pr-4 text-muted-foreground'>{task.task_type}</td>
                          <td className='max-w-sm truncate py-2 pr-4 text-muted-foreground'>
                            {contextValue(task.context, 'resolved_customer_name')} · {contextValue(task.context, 'escalation_reason')}
                          </td>
                          <td className='py-2 pr-4'>
                            {task.enrichment?.sla_state_before ? (
                              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', SLA_STYLES[task.enrichment.sla_state_before] ?? 'bg-muted text-muted-foreground')}>
                                {task.enrichment.sla_state_before}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className='py-2 pr-4'>{statusBadge(task)}</td>
                          <td className='py-2 text-xs text-muted-foreground'>
                            {formatTimestamp(tab === 'open' ? task.created_at : task.decided_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <p className='py-8 text-center text-sm text-muted-foreground'>
                      {tab === 'open' ? 'Queue is clear — no exceptions waiting.' : 'No decisions recorded yet.'}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </ErrorBoundary>
      )}

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className='flex items-center gap-2'>
                  {detail.task_id}
                  {statusBadge(detail)}
                  {detail.enrichment?.is_vip && (
                    <span className='rounded-full bg-brand-purple/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-purple'>
                      VIP
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {contextValue(detail.context, 'resolved_customer_name')} · {contextValue(detail.context, 'escalation_reason')}
                </DialogDescription>
              </DialogHeader>

              <div className='space-y-4 text-sm'>
                <div>
                  <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Diagnosis</p>
                  <p className='mt-1'>{contextValue(detail.context, 'issue_summary')}</p>
                </div>

                <div>
                  <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>AI recommendation</p>
                  <p className='mt-1 rounded-lg bg-muted/20 p-3'>{detail.recommendation || 'No recommendation provided'}</p>
                </div>

                {policyHits(detail.context).length > 0 && (
                  <div>
                    <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Policy hits</p>
                    <div className='mt-1.5 flex flex-wrap gap-1'>
                      {policyHits(detail.context).map((hit) => (
                        <span key={hit} className='rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground'>
                          {hit}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className='grid grid-cols-2 gap-3 text-xs text-muted-foreground'>
                  <p><span className='font-semibold text-foreground'>Task type:</span> {detail.task_type}</p>
                  <p><span className='font-semibold text-foreground'>Ticket:</span> {detail.ticket_id ?? '—'}</p>
                  <p><span className='font-semibold text-foreground'>Department:</span> {detail.enrichment?.department ?? '—'}</p>
                  <p><span className='font-semibold text-foreground'>SLA at intake:</span> {detail.enrichment?.sla_state_before ?? '—'}</p>
                  <p><span className='font-semibold text-foreground'>Resolved by:</span> {detail.resolved_by ?? '—'}</p>
                  <p><span className='font-semibold text-foreground'>Created:</span> {formatTimestamp(detail.created_at)}</p>
                  <p><span className='font-semibold text-foreground'>Decided:</span> {formatTimestamp(detail.decided_at)}</p>
                  {detail.run_id && (
                    <p className='col-span-2'><span className='font-semibold text-foreground'>Run:</span> {detail.run_id}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
