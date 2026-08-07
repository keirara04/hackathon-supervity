'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'

interface ZendeskTicket {
  ticket_id: number
  issue_key: string
  external_id: string | null
  subject: string
  description: string | null
  priority: string | null
  status: string
  tags: string[]
  created_at: string
  due_at: string | null
  requester_name: string | null
  requester_email: string | null
  already_queued: boolean
  queue_status: string | null
}

interface ImportResult {
  issue_key: string
  action: 'inserted' | 'refreshed' | 'error'
  detail?: string
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-red-500/15 text-red-400',
  high: 'bg-amber-500/15 text-amber-400',
  normal: 'bg-brand-cornflower/15 text-brand-cornflower',
  low: 'bg-muted text-muted-foreground',
}

const RESULT_STYLES: Record<ImportResult['action'], string> = {
  inserted: 'bg-emerald-500/15 text-emerald-500',
  refreshed: 'bg-brand-cornflower/15 text-brand-cornflower',
  error: 'bg-red-500/15 text-red-400',
}

export default function ZendeskTicketsPage() {
  const [tickets, setTickets] = useState<ZendeskTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [edits, setEdits] = useState<Record<number, { summary?: string; priority_raw?: string }>>({})
  const [editingId, setEditingId] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<Record<string, ImportResult>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<{ tickets: ZendeskTicket[]; count: number }>('/api/zendesk/tickets')
      setTickets(res.tickets)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Zendesk tickets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function setEdit(id: number, field: 'summary' | 'priority_raw', value: string) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function importSelected() {
    if (selected.size === 0) return
    setImporting(true)
    setError(null)
    try {
      const payload = {
        tickets: Array.from(selected).map((id) => ({
          ticket_id: id,
          summary: edits[id]?.summary,
          priority_raw: edits[id]?.priority_raw,
        })),
      }
      const res = await apiClient.post<{ results: ImportResult[] }>('/api/zendesk/import', payload)
      const resultMap: Record<string, ImportResult> = {}
      res.results.forEach((r) => (resultMap[r.issue_key] = r))
      setResults((prev) => ({ ...prev, ...resultMap }))
      setSelected(new Set())
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <motion.div className='space-y-8' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex items-center justify-between'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>Zendesk Tickets</h1>
          <p className='mt-2 text-lg text-muted-foreground'>
            Live unresolved tickets from Zendesk — {tickets.length} matching the Sweep query.
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {selected.size > 0 && (
            <Button variant='gradient' size='sm' onClick={importSelected} disabled={importing}>
              {importing ? (
                <Icons.loader className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Icons.download className='mr-2 h-4 w-4' />
              )}
              Import selected ({selected.size})
            </Button>
          )}
          <Button variant='outline' size='sm' onClick={load} disabled={loading}>
            <Icons.refresh className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
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

      {loading ? (
        <Card className='p-6'>
          <div className='space-y-3'>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        </Card>
      ) : (
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader>
              <CardTitle>Unresolved Tickets</CardTitle>
              <CardDescription>
                Same query Amsyar&apos;s Sweep operator uses — subject/priority are editable before import.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto'>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground'>
                      <th className='w-8 pb-2'></th>
                      <th className='pb-2 pr-4'>Ticket</th>
                      <th className='pb-2 pr-4'>Subject</th>
                      <th className='pb-2 pr-4'>Requester</th>
                      <th className='pb-2 pr-4'>Priority</th>
                      <th className='pb-2 pr-4'>Status</th>
                      <th className='pb-2'>Queue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => {
                      const isEditing = editingId === t.ticket_id
                      const result = results[t.issue_key]
                      return (
                        <tr key={t.ticket_id} className='border-b border-border/50'>
                          <td className='py-2'>
                            <input
                              type='checkbox'
                              checked={selected.has(t.ticket_id)}
                              onChange={() => toggleSelect(t.ticket_id)}
                              className='h-4 w-4 rounded border-border'
                            />
                          </td>
                          <td className='py-2 pr-4 font-medium'>#{t.ticket_id}</td>
                          <td className='py-2 pr-4'>
                            {isEditing ? (
                              <input
                                autoFocus
                                defaultValue={edits[t.ticket_id]?.summary ?? t.subject}
                                onChange={(e) => setEdit(t.ticket_id, 'summary', e.target.value)}
                                onBlur={() => setEditingId(null)}
                                className='w-full max-w-xs rounded border border-primary/50 bg-background px-2 py-1 text-sm outline-none'
                              />
                            ) : (
                              <button
                                onClick={() => setEditingId(t.ticket_id)}
                                className='flex max-w-xs items-center gap-1 truncate text-left hover:text-primary'
                                title='Click to edit before import'
                              >
                                {edits[t.ticket_id]?.summary ?? t.subject}
                                <Icons.pencil className='h-3 w-3 shrink-0 text-muted-foreground' />
                              </button>
                            )}
                          </td>
                          <td className='py-2 pr-4 text-muted-foreground'>
                            {t.requester_name ?? '—'}
                          </td>
                          <td className='py-2 pr-4'>
                            <input
                              defaultValue={edits[t.ticket_id]?.priority_raw ?? t.priority ?? ''}
                              onChange={(e) => setEdit(t.ticket_id, 'priority_raw', e.target.value)}
                              className={cn(
                                'w-20 rounded-full px-2 py-0.5 text-center text-xs font-medium outline-none',
                                PRIORITY_STYLES[edits[t.ticket_id]?.priority_raw ?? t.priority ?? ''] ?? 'bg-muted text-muted-foreground'
                              )}
                            />
                          </td>
                          <td className='py-2 pr-4 text-xs text-muted-foreground capitalize'>{t.status}</td>
                          <td className='py-2'>
                            {result ? (
                              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', RESULT_STYLES[result.action])}>
                                {result.action}
                              </span>
                            ) : t.already_queued ? (
                              <span className='rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500'>
                                Already queued
                              </span>
                            ) : (
                              <span className='rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500'>
                                Not queued
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {tickets.length === 0 && (
                  <p className='py-8 text-center text-sm text-muted-foreground'>No unresolved tickets found.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  )
}
