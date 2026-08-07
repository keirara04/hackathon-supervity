'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'

interface Cluster {
  cluster_key: string
  total: number
  active: number
  ticket_ids: string[]
  at_threshold: boolean
}

interface DeclaredIncident {
  id: number
  incident_id: string
  title: string
  root_cause: string
  severity: string
  status: string
  child_count: number
  opened_at: string
  resolved_at: string | null
}

interface IncidentsResponse {
  clusters: Cluster[]
  threshold: number
  incidents: DeclaredIncident[]
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-400',
  high: 'bg-amber-500/15 text-amber-400',
}

export default function IncidentsPage() {
  const [data, setData] = useState<IncidentsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [detecting, setDetecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<IncidentsResponse>('/api/incidents')
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load incidents')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function runDetect() {
    setDetecting(true)
    setError(null)
    try {
      await apiClient.post('/api/incidents/detect')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Detection failed')
    } finally {
      setDetecting(false)
    }
  }

  return (
    <motion.div className='space-y-8' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>Incidents</h1>
          <p className='mt-2 text-lg text-muted-foreground'>
            Ticket clusters grouped by cluster_key — the flood-of-tickets scenario, detected from real run_log data.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' size='sm' onClick={load} disabled={loading}>
            <Icons.refresh className={cn('sm:mr-2 h-4 w-4', loading && 'animate-spin')} />
            <span className='hidden sm:inline'>Refresh</span>
          </Button>
          <Button variant='gradient' size='sm' onClick={runDetect} disabled={detecting}>
            {detecting ? (
              <Icons.loader className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <Icons.alertTriangle className='mr-2 h-4 w-4' />
            )}
            Run Detection
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

      <motion.div variants={itemVariants}>
        <h2 className='mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground'>
          Declared Incidents {data && `(${data.incidents.length})`}
        </h2>
        {data && data.incidents.length > 0 ? (
          <div className='grid gap-4 md:grid-cols-2'>
            {data.incidents.map((inc) => (
              <Card key={inc.id}>
                <CardHeader>
                  <div className='flex items-start justify-between gap-2'>
                    <CardTitle className='text-base capitalize'>{inc.title}</CardTitle>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', SEVERITY_STYLES[inc.severity] ?? 'bg-muted text-muted-foreground')}>
                      {inc.severity}
                    </span>
                  </div>
                  <CardDescription>{inc.incident_id} · {inc.status}</CardDescription>
                </CardHeader>
                <CardContent className='space-y-2 text-sm'>
                  <p>{inc.root_cause}</p>
                  <p className='text-xs text-muted-foreground'>
                    {inc.child_count} linked tickets · opened {new Date(inc.opened_at).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className='py-8 text-center text-sm text-muted-foreground'>
              No incidents declared yet — run detection if a cluster is at threshold below.
            </CardContent>
          </Card>
        )}
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Clusters</CardTitle>
            <CardDescription>
              Grouped by cluster_key from run_log. At or above {data?.threshold ?? '—'} active tickets triggers detection.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground'>
                    <th className='pb-2 pr-4'>Cluster</th>
                    <th className='pb-2 pr-4'>Active</th>
                    <th className='pb-2 pr-4'>Total</th>
                    <th className='pb-2'>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.clusters.map((c) => (
                    <tr key={c.cluster_key} className='border-b border-border/50'>
                      <td className='py-2 pr-4 font-medium capitalize'>{c.cluster_key}</td>
                      <td className='py-2 pr-4'>{c.active}</td>
                      <td className='py-2 pr-4 text-muted-foreground'>{c.total}</td>
                      <td className='py-2'>
                        {c.at_threshold ? (
                          <span className='rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400'>
                            At threshold
                          </span>
                        ) : (
                          <span className='text-xs text-muted-foreground'>Below threshold</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data?.clusters.length === 0 && !loading && (
                <p className='py-8 text-center text-sm text-muted-foreground'>No clustered tickets yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}
