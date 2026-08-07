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
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'

interface WorkbenchTask {
  id: number
  task_id: string
  ticket_id: string | null
  run_id: string | null
  task_type: string
  context: Record<string, unknown>
  recommendation: string | null
  assigned_to: string | null
  status: string
  human_decision: string | null
  resolved_by: string | null
  created_at: string
  decided_at: string | null
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

function contextValue(context: Record<string, unknown>, key: string): string {
  const v = context?.[key]
  if (v === undefined || v === null) return '—'
  return String(v)
}

export default function WorkbenchPage() {
  const [tasks, setTasks] = useState<WorkbenchTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deciding, setDeciding] = useState(false)
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<{ tasks: WorkbenchTask[]; count: number }>(
        '/api/workbench?status=open&limit=100'
      )
      setTasks(res.tasks)
      setSelectedId((prev) =>
        prev && res.tasks.some((t) => t.task_id === prev) ? prev : res.tasks[0]?.task_id ?? null
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workbench queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const selected = tasks.find((t) => t.task_id === selectedId) ?? null

  async function decide(decision: 'approve' | 'edit' | 'reject') {
    if (!selected) return
    setDeciding(true)
    try {
      await apiClient.patch(`/api/workbench/${selected.task_id}/decide`, {
        decision,
        resolved_by: 'dev-user',
        notes: notes || undefined,
      })
      setNotes('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record decision')
    } finally {
      setDeciding(false)
    }
  }

  return (
    <motion.div
      className='space-y-8'
      variants={containerVariants}
      initial='hidden'
      animate='visible'
    >
      <motion.div variants={itemVariants} className='flex items-center justify-between'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>Workbench</h1>
          <p className='mt-2 text-lg text-muted-foreground'>
            Exceptions the AI Employee couldn&apos;t resolve alone — {tasks.length} open.
          </p>
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

      {!loading && tasks.length === 0 && !error && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className='flex flex-col items-center gap-2 py-16 text-center'>
              <Icons.checkCircle className='h-10 w-10 text-emerald-500' />
              <p className='text-lg font-medium'>Queue is clear</p>
              <p className='text-sm text-muted-foreground'>
                No exceptions waiting on a human right now.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {tasks.length > 0 && (
        <motion.div variants={itemVariants} className='grid gap-6 lg:grid-cols-[380px_1fr]'>
          {/* Queue list */}
          <Card className='flex max-h-[70vh] flex-col overflow-hidden'>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base'>Queue</CardTitle>
            </CardHeader>
            <CardContent className='flex-1 space-y-2 overflow-y-auto pt-0'>
              {tasks.map((task) => (
                <button
                  key={task.task_id}
                  type='button'
                  onClick={() => setSelectedId(task.task_id)}
                  className={cn(
                    'w-full rounded-lg border border-border p-3 text-left text-sm transition-colors',
                    task.task_id === selectedId
                      ? 'border-primary/50 bg-primary/10'
                      : 'bg-muted/10 hover:bg-muted/20'
                  )}
                >
                  <div className='flex items-center justify-between'>
                    <span className='font-medium'>{task.task_id}</span>
                    <span className='rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground'>
                      {task.task_type}
                    </span>
                  </div>
                  <p className='mt-1 truncate text-xs text-muted-foreground'>
                    {contextValue(task.context, 'resolved_customer_name')} ·{' '}
                    {contextValue(task.context, 'escalation_reason')}
                  </p>
                </button>
              ))}
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
                      </CardDescription>
                    </div>
                    <span className='rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-500'>
                      {selected.status}
                    </span>
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
                </CardContent>
              </>
            ) : (
              <CardContent className='py-16 text-center text-sm text-muted-foreground'>
                Select an item from the queue
              </CardContent>
            )}
          </Card>
        </motion.div>
      )}
    </motion.div>
  )
}
