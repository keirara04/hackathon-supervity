'use client'

import { useState, useMemo, useCallback, useEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatTimestamp } from '@/lib/format'
import { apiClient } from '@/lib/api-client'
import { useWorkbenchQueue, type WorkbenchTask } from '@/hooks'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

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

function QueueSkeleton() {
  return (
    <div className='space-y-2'>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className='space-y-2 rounded-lg border border-border p-3'>
          <div className='flex items-center justify-between'>
            <Skeleton variant='text' className='h-4 w-20' />
            <Skeleton variant='text' className='h-4 w-16' />
          </div>
          <Skeleton variant='text' className='h-3 w-full' />
        </div>
      ))}
    </div>
  )
}

// Memoized so only the previously-selected and newly-selected rows re-render
// when selection changes, instead of every row in the list.
const QueueRow = memo(function QueueRow({
  task,
  isSelected,
  onSelect,
}: {
  task: WorkbenchTask
  isSelected: boolean
  onSelect: (taskId: string) => void
}) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
      type='button'
      role='option'
      aria-selected={isSelected}
      id={`queue-row-${task.task_id}`}
      onClick={() => onSelect(task.task_id)}
      className={cn(
        'w-full rounded-lg border border-border p-3 text-left text-sm transition-colors',
        isSelected ? 'border-primary/50 bg-primary/10' : 'bg-muted/10 hover:bg-muted/20'
      )}
    >
      <div className='flex items-center justify-between'>
        <span className='font-medium'>{task.task_id}</span>
        <div className='flex items-center gap-1.5'>
          {task.enrichment?.is_vip && (
            <span className='rounded-full bg-brand-purple/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-purple'>
              VIP
            </span>
          )}
          {task.enrichment?.sla_state_before && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                SLA_STYLES[task.enrichment.sla_state_before] ?? 'bg-muted text-muted-foreground'
              )}
            >
              {task.enrichment.sla_state_before}
            </span>
          )}
        </div>
      </div>
      <p className='mt-1 truncate text-xs text-muted-foreground'>
        {contextValue(task.context, 'resolved_customer_name')} ·{' '}
        {contextValue(task.context, 'escalation_reason')}
      </p>
      {policyHits(task.context).length > 0 && (
        <div className='mt-1.5 flex flex-wrap gap-1'>
          {policyHits(task.context).map((hit) => (
            <span key={hit} className='rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground'>
              {hit}
            </span>
          ))}
        </div>
      )}
    </motion.button>
  )
})

export default function WorkbenchPage() {
  const { tasks, history, loading, error: loadError, reload } = useWorkbenchQueue()
  const [tab, setTab] = useState<'queue' | 'history'>('queue')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [historyDetail, setHistoryDetail] = useState<WorkbenchTask | null>(null)
  const [deciding, setDeciding] = useState(false)
  const [decideError, setDecideError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [modifying, setModifying] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [agents, setAgents] = useState<{ agent_name: string; agent_email: string | null; on_call: boolean }[]>([])
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    apiClient
      .get<{ agents: { agent_name: string; agent_email: string | null; on_call: boolean }[] }>('/api/team-roster')
      .then((res) => setAgents(res.agents))
      .catch(() => {
        // Non-critical — the Assign control just shows empty if this fails.
      })
  }, [])

  const error = loadError ?? decideError
  const activeList = tab === 'queue' ? tasks : history
  const effectiveSelectedId = selectedId && tasks.some((t) => t.task_id === selectedId) ? selectedId : tasks[0]?.task_id ?? null
  const selected = tasks.find((t) => t.task_id === effectiveSelectedId) ?? null

  const typeCounts = useMemo(
    () =>
      tasks.reduce<Record<string, number>>((acc, t) => {
        acc[t.task_type] = (acc[t.task_type] ?? 0) + 1
        return acc
      }, {}),
    [tasks]
  )

  const selectTask = useCallback((taskId: string) => {
    setSelectedId(taskId)
    setModifying(false)
    setNotes('')
  }, [])

  const startModify = useCallback(() => {
    setModifying(true)
    setNotes(selected?.recommendation ?? '')
  }, [selected])

  const cancelModify = useCallback(() => {
    setModifying(false)
    setNotes('')
  }, [])

  const decide = useCallback(
    async (decision: 'approve' | 'edit' | 'reject') => {
      if (!selected) return
      if (decision === 'edit' && !modifying) {
        startModify()
        return
      }
      setDeciding(true)
      setDecideError(null)
      try {
        await apiClient.patch(`/api/workbench/${selected.task_id}/decide`, {
          decision,
          resolved_by: 'dev-user',
          notes: notes || undefined,
        })
        setConfirmation(`${DECISION_LABEL[decision]} ${selected.task_id}`)
        setTimeout(() => setConfirmation(null), 2500)
        setNotes('')
        setModifying(false)
        await reload()
      } catch (e) {
        setDecideError(e instanceof Error ? e.message : 'Failed to record decision')
      } finally {
        setDeciding(false)
      }
    },
    [selected, modifying, notes, startModify, reload]
  )

  const assignTo = useCallback(
    async (assignee: string) => {
      if (!selected || !assignee) return
      setAssigning(true)
      try {
        await apiClient.patch(`/api/workbench/${selected.task_id}/assign`, { assigned_to: assignee })
        await reload()
      } catch (e) {
        setDecideError(e instanceof Error ? e.message : 'Failed to assign task')
      } finally {
        setAssigning(false)
      }
    },
    [selected, reload]
  )

  // Keyboard nav on the queue list — Up/Down moves selection, matching the
  // listbox pattern (role=listbox/option set on the elements below).
  const handleQueueKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (tasks.length === 0) return
      const currentIndex = tasks.findIndex((t) => t.task_id === effectiveSelectedId)

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = tasks[Math.min(currentIndex + 1, tasks.length - 1)]
        if (next) selectTask(next.task_id)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = tasks[Math.max(currentIndex - 1, 0)]
        if (prev) selectTask(prev.task_id)
      } else if (e.key === 'Enter') {
        e.preventDefault()
      }
    },
    [tasks, effectiveSelectedId, selectTask]
  )

  return (
    <motion.div
      className='space-y-8'
      variants={containerVariants}
      initial='hidden'
      animate='visible'
    >
      <motion.div variants={itemVariants} className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>
            Workbench
          </h1>
          <div className='mt-2 flex flex-wrap items-center gap-2 text-lg text-muted-foreground'>
            <span>Exceptions the AI Employee couldn&apos;t resolve alone — {tasks.length} open.</span>
            {Object.entries(typeCounts).map(([type, count]) => (
              <span key={type} className='rounded-full bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground'>
                {count} {type}
              </span>
            ))}
          </div>
        </div>
        <Button variant='outline' size='sm' onClick={reload} disabled={loading}>
          <Icons.refresh className={cn('sm:mr-2 h-4 w-4', loading && 'animate-spin')} />
          <span className='hidden sm:inline'>Refresh</span>
        </Button>
      </motion.div>

      <AnimatePresence>
        {confirmation && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            aria-live='polite'
          >
            <Card className='border-emerald-500/40 bg-emerald-500/5'>
              <CardContent className='flex items-center gap-2 py-3 text-sm text-emerald-400'>
                <Icons.checkCircle className='h-4 w-4' />
                {confirmation}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

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

      <motion.div variants={itemVariants} className='flex gap-2'>
        {(['queue', 'history'] as const).map((t) => (
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
            {t} {t === 'queue' ? `(${tasks.length})` : `(${history.length})`}
          </button>
        ))}
      </motion.div>

      {!loading && activeList.length === 0 && !error && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className='flex flex-col items-center gap-2 py-16 text-center'>
              <Icons.checkCircle className='h-10 w-10 text-emerald-500' />
              <p className='text-lg font-medium'>{tab === 'queue' ? 'Queue is clear' : 'No decisions yet'}</p>
              <p className='text-sm text-muted-foreground'>
                {tab === 'queue' ? 'No exceptions waiting on a human right now.' : 'Approve, modify, or reject an item to see it here.'}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {loading && (
        <motion.div variants={itemVariants} className='grid gap-6 lg:grid-cols-[380px_1fr]'>
          <Card className='p-4'>
            <QueueSkeleton />
          </Card>
          <Card className='p-6'>
            <Skeleton variant='text' className='h-6 w-40' />
            <Skeleton className='mt-4 h-24 w-full' />
          </Card>
        </motion.div>
      )}

      {!loading && tab === 'queue' && tasks.length > 0 && (
        <ErrorBoundary>
          <motion.div variants={itemVariants} className='grid gap-6 lg:grid-cols-[380px_1fr]'>
            {/* Queue list */}
            <Card className='flex max-h-[70vh] flex-col overflow-hidden'>
              <CardHeader className='pb-3'>
                <CardTitle className='text-base'>Queue</CardTitle>
              </CardHeader>
              <CardContent
                className='flex-1 space-y-2 overflow-y-auto pt-0 outline-none'
                role='listbox'
                aria-label='Workbench queue'
                aria-activedescendant={effectiveSelectedId ? `queue-row-${effectiveSelectedId}` : undefined}
                tabIndex={0}
                onKeyDown={handleQueueKeyDown}
              >
                <AnimatePresence>
                  {tasks.map((task) => (
                    <QueueRow
                      key={task.task_id}
                      task={task}
                      isSelected={task.task_id === effectiveSelectedId}
                      onSelect={selectTask}
                    />
                  ))}
                </AnimatePresence>
              </CardContent>
            </Card>

            {/* Detail panel */}
            <Card>
              {selected ? (
                <>
                  <CardHeader>
                    <div className='flex items-start justify-between'>
                      <div>
                        <CardTitle>{selected.task_id}</CardTitle>
                        <CardDescription>
                          Ticket {contextValue(selected.context, 'ticket_id')} ·{' '}
                          {contextValue(selected.context, 'resolved_customer_name')}
                          {selected.enrichment?.department && ` · ${selected.enrichment.department}`}
                        </CardDescription>
                      </div>
                      <div className='flex items-center gap-2'>
                        {selected.enrichment?.is_vip && (
                          <span className='rounded-full bg-brand-purple/15 px-3 py-1 text-xs font-semibold uppercase text-brand-purple'>
                            VIP
                          </span>
                        )}
                        {selected.enrichment?.sla_state_before && (
                          <span
                            className={cn(
                              'rounded-full px-3 py-1 text-xs font-medium',
                              SLA_STYLES[selected.enrichment.sla_state_before] ?? 'bg-muted text-muted-foreground'
                            )}
                          >
                            {selected.enrichment.sla_state_before}
                          </span>
                        )}
                        <span className='rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-500'>
                          {selected.status}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className='space-y-6'>
                    <div>
                      <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                        Why it&apos;s here
                      </p>
                      <p className='mt-1 text-sm'>
                        {contextValue(selected.context, 'escalation_reason')}
                      </p>
                      {policyHits(selected.context).length > 0 && (
                        <div className='mt-2 flex flex-wrap gap-1.5'>
                          {policyHits(selected.context).map((hit) => (
                            <span key={hit} className='rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground'>
                              {hit}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                        Diagnosis
                      </p>
                      <p className='mt-1 text-sm'>
                        {contextValue(selected.context, 'issue_summary')}
                      </p>
                    </div>

                    <div>
                      <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                        AI recommendation
                      </p>
                      <p className='mt-1 rounded-lg bg-muted/20 p-3 text-sm'>
                        {selected.recommendation || 'No recommendation provided'}
                      </p>
                    </div>

                    <div>
                      <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                        Assigned to
                      </p>
                      <div className='mt-1 flex items-center gap-2'>
                        <select
                          value={selected.assigned_to ?? ''}
                          onChange={(e) => assignTo(e.target.value)}
                          disabled={assigning}
                          className='w-full rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm outline-none focus:border-primary/50 sm:w-64'
                        >
                          <option value=''>Unassigned</option>
                          {agents.map((agent) => (
                            <option key={agent.agent_name} value={agent.agent_email ?? agent.agent_name}>
                              {agent.agent_name}
                              {agent.on_call ? ' (on-call)' : ''}
                            </option>
                          ))}
                        </select>
                        {assigning && <Icons.loader className='h-4 w-4 animate-spin text-muted-foreground' />}
                      </div>
                    </div>

                    {modifying ? (
                      <div className='rounded-lg border border-brand-cornflower/40 bg-brand-cornflower/5 p-3'>
                        <label className='text-xs font-semibold uppercase tracking-wide text-brand-cornflower'>
                          Your revised recommendation
                        </label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={3}
                          autoFocus
                          placeholder='Edit the recommendation before applying...'
                          className='mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm outline-none focus:border-brand-cornflower/50'
                        />
                        <div className='mt-2 flex gap-2'>
                          <Button
                            variant='gradient'
                            size='sm'
                            disabled={deciding || !notes.trim()}
                            onClick={() => decide('edit')}
                          >
                            <Icons.check className='mr-2 h-4 w-4' />
                            Confirm modification
                          </Button>
                          <Button variant='outline' size='sm' onClick={cancelModify} disabled={deciding}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                          Notes (optional)
                        </label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={2}
                          placeholder='Why you made this call...'
                          className='mt-1 w-full rounded-lg border border-border bg-muted/10 p-2 text-sm outline-none focus:border-primary/50'
                        />
                      </div>
                    )}

                    {!modifying && (
                      <div className='flex flex-wrap gap-3'>
                        <Button
                          variant='gradient'
                          disabled={deciding}
                          onClick={() => decide('approve')}
                        >
                          <Icons.check className='mr-2 h-4 w-4' />
                          Approve
                        </Button>
                        <Button
                          variant='outline'
                          disabled={deciding}
                          onClick={() => decide('edit')}
                        >
                          <Icons.pencil className='mr-2 h-4 w-4' />
                          Modify
                        </Button>
                        <Button
                          variant='destructive'
                          disabled={deciding}
                          onClick={() => decide('reject')}
                        >
                          <Icons.close className='mr-2 h-4 w-4' />
                          Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </>
              ) : (
                <CardContent className='py-16 text-center text-sm text-muted-foreground'>
                  Select an item from the queue
                </CardContent>
              )}
            </Card>
          </motion.div>
        </ErrorBoundary>
      )}

      {!loading && tab === 'history' && history.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className='divide-y divide-border pt-6'>
              {history.map((task) => (
                <button
                  key={task.task_id}
                  type='button'
                  onClick={() => setHistoryDetail(task)}
                  className='flex w-full items-start justify-between gap-4 py-3 text-left transition-colors hover:bg-muted/10'
                >
                  <div>
                    <div className='flex items-center gap-2'>
                      <span className='font-medium text-sm'>{task.task_id}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium',
                          DECISION_STYLES[task.human_decision ?? ''] ?? 'bg-muted text-muted-foreground'
                        )}
                      >
                        {DECISION_LABEL[task.human_decision ?? ''] ?? task.status}
                      </span>
                    </div>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {contextValue(task.context, 'resolved_customer_name')} · {contextValue(task.context, 'escalation_reason')}
                    </p>
                  </div>
                  <div className='shrink-0 text-right text-xs text-muted-foreground'>
                    <p>{task.resolved_by}</p>
                    <p>{formatTimestamp(task.decided_at)}</p>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Dialog open={historyDetail !== null} onOpenChange={(open) => !open && setHistoryDetail(null)}>
        <DialogContent>
          {historyDetail && (
            <>
              <DialogHeader>
                <DialogTitle className='flex items-center gap-2'>
                  {historyDetail.task_id}
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                      DECISION_STYLES[historyDetail.human_decision ?? ''] ?? 'bg-muted text-muted-foreground'
                    )}
                  >
                    {DECISION_LABEL[historyDetail.human_decision ?? ''] ?? historyDetail.status}
                  </span>
                  {historyDetail.enrichment?.is_vip && (
                    <span className='rounded-full bg-brand-purple/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-purple'>
                      VIP
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {contextValue(historyDetail.context, 'resolved_customer_name')} ·{' '}
                  {contextValue(historyDetail.context, 'escalation_reason')}
                </DialogDescription>
              </DialogHeader>

              <div className='space-y-4 text-sm'>
                {historyDetail.recommendation && (
                  <div>
                    <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Recommendation</p>
                    <p className='mt-1'>{historyDetail.recommendation}</p>
                  </div>
                )}

                {policyHits(historyDetail.context).length > 0 && (
                  <div>
                    <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Policy hits</p>
                    <div className='mt-1.5 flex flex-wrap gap-1'>
                      {policyHits(historyDetail.context).map((hit) => (
                        <span key={hit} className='rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground'>
                          {hit}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className='grid grid-cols-2 gap-3 text-xs text-muted-foreground'>
                  <p><span className='font-semibold text-foreground'>Task type:</span> {historyDetail.task_type}</p>
                  <p><span className='font-semibold text-foreground'>Ticket:</span> {historyDetail.ticket_id ?? '—'}</p>
                  <p><span className='font-semibold text-foreground'>Department:</span> {historyDetail.enrichment?.department ?? '—'}</p>
                  <p><span className='font-semibold text-foreground'>SLA at intake:</span> {historyDetail.enrichment?.sla_state_before ?? '—'}</p>
                  <p><span className='font-semibold text-foreground'>Assigned to:</span> {historyDetail.assigned_to ?? '—'}</p>
                  <p><span className='font-semibold text-foreground'>Resolved by:</span> {historyDetail.resolved_by ?? '—'}</p>
                  <p><span className='font-semibold text-foreground'>Created:</span> {formatTimestamp(historyDetail.created_at)}</p>
                  <p><span className='font-semibold text-foreground'>Decided:</span> {formatTimestamp(historyDetail.decided_at)}</p>
                  {historyDetail.run_id && (
                    <p className='col-span-2'><span className='font-semibold text-foreground'>Run:</span> {historyDetail.run_id}</p>
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
