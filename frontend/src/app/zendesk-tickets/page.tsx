'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { useSearchFilter } from '@/hooks'

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
  const [detailTicket, setDetailTicket] = useState<ZendeskTicket | null>(null)

  const { query, setQuery, filtered: visibleTickets } = useSearchFilter(
    tickets,
    (t) => `${t.subject} ${t.requester_name ?? ''} ${t.issue_key} ${t.tags.join(' ')}`
  )

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
      <motion.div variants={itemVariants} className='flex flex-wrap items-center justify-between gap-3'>
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
                <Icons.loader className='h-4 w-4 animate-spin sm:mr-2' />
              ) : (
                <Icons.download className='h-4 w-4 sm:mr-2' />
              )}
              <span className='hidden sm:inline'>Import selected</span> ({selected.size})
            </Button>
          )}
          <Button variant='outline' size='sm' onClick={load} disabled={loading}>
            <Icons.refresh className={cn('sm:mr-2 h-4 w-4', loading && 'animate-spin')} />
            <span className='hidden sm:inline'>Refresh</span>
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

      <motion.div variants={itemVariants} className='relative'>
        <Icons.search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search subject, requester, ticket #, tags...'
          className='w-full rounded-full border border-border bg-muted/10 py-2 pl-9 pr-4 text-sm outline-none focus:border-primary/50 sm:max-w-sm'
        />
      </motion.div>

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
              {/* Mobile: stacked cards, no horizontal scrolling */}
              <div className='space-y-3 sm:hidden'>
                {visibleTickets.map((t) => {
                  const isEditing = editingId === t.ticket_id
                  const result = results[t.issue_key]
                  return (
                    <div
                      key={t.ticket_id}
                      onClick={() => setDetailTicket(t)}
                      className='cursor-pointer rounded-lg border border-border p-3 hover:bg-muted/10'
                    >
                      <div className='flex items-start justify-between gap-2'>
                        <div className='flex items-center gap-2' onClick={(e) => e.stopPropagation()}>
                          <input
                            type='checkbox'
                            checked={selected.has(t.ticket_id)}
                            onChange={() => toggleSelect(t.ticket_id)}
                            className='h-4 w-4 rounded border-border'
                          />
                          <span className='font-medium'>#{t.ticket_id}</span>
                        </div>
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
                      </div>

                      <div className='mt-2' onClick={(e) => e.stopPropagation()}>
                        {isEditing ? (
                          <input
                            autoFocus
                            defaultValue={edits[t.ticket_id]?.summary ?? t.subject}
                            onChange={(e) => setEdit(t.ticket_id, 'summary', e.target.value)}
                            onBlur={() => setEditingId(null)}
                            className='w-full rounded border border-primary/50 bg-background px-2 py-1 text-sm outline-none'
                          />
                        ) : (
                          <button
                            onClick={() => setEditingId(t.ticket_id)}
                            className='flex w-full items-center gap-1 text-left text-sm hover:text-primary'
                            title='Tap to edit before import'
                          >
                            <span className='truncate'>{edits[t.ticket_id]?.summary ?? t.subject}</span>
                            <Icons.pencil className='h-3 w-3 shrink-0 text-muted-foreground' />
                          </button>
                        )}
                      </div>

                      <div className='mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                        <span>{t.requester_name ?? '—'}</span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 font-medium',
                            PRIORITY_STYLES[t.priority ?? ''] ?? 'bg-muted text-muted-foreground'
                          )}
                        >
                          {t.priority ?? 'none'}
                        </span>
                        <span className='capitalize'>{t.status}</span>
                      </div>
                    </div>
                  )
                })}
                {visibleTickets.length === 0 && (
                  <p className='py-8 text-center text-sm text-muted-foreground'>No unresolved tickets found.</p>
                )}
              </div>

              {/* Desktop/tablet: full table with inline editing */}
              <div className='hidden overflow-x-auto sm:block'>
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
                    {visibleTickets.map((t) => {
                      const isEditing = editingId === t.ticket_id
                      const result = results[t.issue_key]
                      return (
                        <tr
                          key={t.ticket_id}
                          onClick={() => setDetailTicket(t)}
                          className='cursor-pointer border-b border-border/50 hover:bg-muted/10'
                        >
                          <td className='py-2' onClick={(e) => e.stopPropagation()}>
                            <input
                              type='checkbox'
                              checked={selected.has(t.ticket_id)}
                              onChange={() => toggleSelect(t.ticket_id)}
                              className='h-4 w-4 rounded border-border'
                            />
                          </td>
                          <td className='py-2 pr-4 font-medium'>#{t.ticket_id}</td>
                          <td className='py-2 pr-4' onClick={(e) => e.stopPropagation()}>
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
                          <td className='py-2 pr-4' onClick={(e) => e.stopPropagation()}>
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
                {visibleTickets.length === 0 && (
                  <p className='py-8 text-center text-sm text-muted-foreground'>No unresolved tickets found.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <Dialog open={detailTicket !== null} onOpenChange={(open) => !open && setDetailTicket(null)}>
        <DialogContent>
          {detailTicket && (
            <>
              <DialogHeader>
                <DialogTitle>#{detailTicket.ticket_id} — {detailTicket.subject}</DialogTitle>
                <DialogDescription>
                  {detailTicket.requester_name ?? 'Unknown requester'} ({detailTicket.requester_email ?? 'no email'})
                </DialogDescription>
              </DialogHeader>
              <div className='space-y-3 text-sm'>
                <div>
                  <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Description</p>
                  <p className='mt-1'>{detailTicket.description || 'No description provided'}</p>
                </div>
                <div className='grid grid-cols-2 gap-3 text-xs text-muted-foreground'>
                  <p><span className='font-semibold text-foreground'>External ID:</span> {detailTicket.external_id ?? '—'}</p>
                  <p><span className='font-semibold text-foreground'>Priority:</span> {detailTicket.priority ?? '—'}</p>
                  <p><span className='font-semibold text-foreground'>Status:</span> {detailTicket.status}</p>
                  <p><span className='font-semibold text-foreground'>Queue:</span> {detailTicket.queue_status ?? (detailTicket.already_queued ? 'queued' : 'not queued')}</p>
                  <p><span className='font-semibold text-foreground'>Created:</span> {new Date(detailTicket.created_at).toLocaleString()}</p>
                  <p><span className='font-semibold text-foreground'>Due:</span> {detailTicket.due_at ? new Date(detailTicket.due_at).toLocaleString() : '—'}</p>
                </div>
                {detailTicket.tags.length > 0 && (
                  <div>
                    <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Tags</p>
                    <div className='mt-1 flex flex-wrap gap-1'>
                      {detailTicket.tags.map((tag) => (
                        <span key={tag} className='rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground'>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
