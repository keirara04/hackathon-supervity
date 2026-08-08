'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { useSearchFilter } from '@/hooks'

interface TriageItem {
  issue_key: string
  issue_id: number
  summary: string
  department: string | null
  is_vip: boolean
  sla_state: string | null
  priority_tier: string | null
  priority_score: number | null
  hours_to_breach: number | null
  cluster_key: string | null
  channel: string | null
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

const SLA_STYLES: Record<string, string> = {
  Breached: 'bg-red-500/15 text-red-400',
  'At Risk': 'bg-amber-500/15 text-amber-400',
  OK: 'bg-emerald-500/15 text-emerald-500',
}

export default function TriageQueuePage() {
  const [items, setItems] = useState<TriageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailItem, setDetailItem] = useState<TriageItem | null>(null)

  const { query, setQuery, filtered: visibleItems } = useSearchFilter(
    items,
    (item) => `${item.issue_key} ${item.summary} ${item.department ?? ''} ${item.cluster_key ?? ''}`
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<{ queue: TriageItem[]; count: number }>('/api/triage-queue?limit=200')
      setItems(res.queue)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load triage queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Cluster sizes — tickets sharing a cluster_key hint at a brewing incident
  const clusterSizes = items.reduce<Record<string, number>>((acc, item) => {
    if (item.cluster_key) acc[item.cluster_key] = (acc[item.cluster_key] ?? 0) + 1
    return acc
  }, {})

  return (
    <motion.div className='space-y-8' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>Triage Queue</h1>
          <p className='mt-2 text-lg text-muted-foreground'>
            {items.length} tickets ranked and waiting to be released into a run.
          </p>
        </div>
        <Button variant='outline' size='sm' onClick={load} disabled={loading}>
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

      <motion.div variants={itemVariants} className='relative'>
        <Icons.search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search ticket, summary, department, cluster...'
          className='w-full rounded-full border border-border bg-muted/10 py-2 pl-9 pr-4 text-sm outline-none focus:border-primary/50 sm:max-w-sm'
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Queued, by priority</CardTitle>
            <CardDescription>Highest priority_score first — what the Orchestrator would pick up next.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Mobile: stacked cards, no horizontal scrolling */}
            <div className='space-y-3 sm:hidden'>
              {visibleItems.map((item) => (
                <div
                  key={item.issue_key}
                  onClick={() => setDetailItem(item)}
                  className='cursor-pointer rounded-lg border border-border p-3 hover:bg-muted/10'
                >
                  <div className='flex items-center justify-between'>
                    <span className='font-medium'>
                      {item.issue_key}
                      {item.is_vip && (
                        <span className='ml-2 rounded-full bg-brand-purple/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-purple'>
                          VIP
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        SLA_STYLES[item.sla_state ?? ''] ?? 'bg-muted text-muted-foreground'
                      )}
                    >
                      {item.sla_state ?? 'unknown'}
                    </span>
                  </div>
                  <p className='mt-1.5 text-sm text-muted-foreground'>{item.summary}</p>
                  <div className='mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                    <span className='font-mono'>{item.priority_tier ?? '—'}</span>
                    <span>({item.priority_score ?? '—'})</span>
                    {item.department && <span>· {item.department}</span>}
                    {item.channel && <span>· {item.channel}</span>}
                  </div>
                  {item.cluster_key && (
                    <span
                      className={cn(
                        'mt-2 inline-block rounded-full px-2 py-0.5 text-xs',
                        (clusterSizes[item.cluster_key] ?? 0) > 2
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {item.cluster_key} ({clusterSizes[item.cluster_key]})
                    </span>
                  )}
                </div>
              ))}
              {visibleItems.length === 0 && !loading && (
                <p className='py-8 text-center text-sm text-muted-foreground'>Queue is empty.</p>
              )}
            </div>

            {/* Desktop/tablet: full table */}
            <div className='hidden overflow-x-auto sm:block'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground'>
                    <th className='pb-2 pr-4'>Ticket</th>
                    <th className='pb-2 pr-4'>Summary</th>
                    <th className='pb-2 pr-4'>Priority</th>
                    <th className='pb-2 pr-4'>SLA</th>
                    <th className='pb-2 pr-4'>Department</th>
                    <th className='pb-2 pr-4'>Cluster</th>
                    <th className='pb-2'>Channel</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => (
                    <tr
                      key={item.issue_key}
                      onClick={() => setDetailItem(item)}
                      className='cursor-pointer border-b border-border/50 hover:bg-muted/10'
                    >
                      <td className='py-2 pr-4 font-medium'>
                        {item.issue_key}
                        {item.is_vip && (
                          <span className='ml-2 rounded-full bg-brand-purple/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-purple'>
                            VIP
                          </span>
                        )}
                      </td>
                      <td className='max-w-sm truncate py-2 pr-4 text-muted-foreground'>{item.summary}</td>
                      <td className='py-2 pr-4'>
                        <span className='font-mono text-xs'>{item.priority_tier ?? '—'}</span>{' '}
                        <span className='text-xs text-muted-foreground'>({item.priority_score ?? '—'})</span>
                      </td>
                      <td className='py-2 pr-4'>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            SLA_STYLES[item.sla_state ?? ''] ?? 'bg-muted text-muted-foreground'
                          )}
                        >
                          {item.sla_state ?? 'unknown'}
                        </span>
                      </td>
                      <td className='py-2 pr-4 text-muted-foreground'>{item.department ?? '—'}</td>
                      <td className='py-2 pr-4'>
                        {item.cluster_key ? (
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs',
                              (clusterSizes[item.cluster_key] ?? 0) > 2
                                ? 'bg-red-500/15 text-red-400'
                                : 'bg-muted text-muted-foreground'
                            )}
                            title={
                              (clusterSizes[item.cluster_key] ?? 0) > 2
                                ? `${clusterSizes[item.cluster_key]} tickets in this cluster — possible incident`
                                : undefined
                            }
                          >
                            {item.cluster_key} ({clusterSizes[item.cluster_key]})
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className='py-2 text-xs text-muted-foreground'>{item.channel ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleItems.length === 0 && !loading && (
                <p className='py-8 text-center text-sm text-muted-foreground'>Queue is empty.</p>
              )}
            </div>
          </CardContent>

        </Card>
      </motion.div>

      <Dialog open={detailItem !== null} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent>
          {detailItem && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {detailItem.issue_key}
                  {detailItem.is_vip && <span className='ml-2 text-xs font-semibold uppercase text-brand-purple'>VIP</span>}
                </DialogTitle>
                <DialogDescription>{detailItem.summary}</DialogDescription>
              </DialogHeader>
              <div className='grid grid-cols-2 gap-3 text-xs text-muted-foreground'>
                <p><span className='font-semibold text-foreground'>Priority tier:</span> {detailItem.priority_tier ?? '—'}</p>
                <p><span className='font-semibold text-foreground'>Priority score:</span> {detailItem.priority_score ?? '—'}</p>
                <p><span className='font-semibold text-foreground'>SLA state:</span> {detailItem.sla_state ?? 'unknown'}</p>
                <p><span className='font-semibold text-foreground'>Hours to breach:</span> {detailItem.hours_to_breach?.toFixed(1) ?? '—'}</p>
                <p><span className='font-semibold text-foreground'>Department:</span> {detailItem.department ?? '—'}</p>
                <p><span className='font-semibold text-foreground'>Channel:</span> {detailItem.channel ?? '—'}</p>
                <p><span className='font-semibold text-foreground'>Cluster:</span> {detailItem.cluster_key ?? '—'}</p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
