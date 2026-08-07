'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'

interface TableEntry {
  name: string
  count: number | null
}

interface SystemHealth {
  name: string
  role: string
  category: 'channel' | 'system_of_record'
  status: 'up' | 'down' | 'not_configured'
  detail: string
  latency_ms: number
  missing_env: string[]
  tables?: TableEntry[]
}

interface HealthResponse {
  systems: SystemHealth[]
  checked_at: string
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

const STATUS_STYLES: Record<SystemHealth['status'], { dot: string; label: string; text: string }> = {
  up: { dot: 'bg-emerald-500', label: 'Healthy', text: 'text-emerald-500' },
  down: { dot: 'bg-red-500', label: 'Down', text: 'text-red-400' },
  not_configured: { dot: 'bg-amber-400', label: 'Setup needed', text: 'text-amber-500' },
}

// Deep links from a Supabase table to the page in this app that reads it.
const TABLE_LINKS: Record<string, string> = {
  run_log: '/run-log',
  workbench_tasks: '/workbench',
  policy_config: '/ai/policies',
  policy_eval_log: '/ai/policies',
  triage_queue: '/triage-queue',
  kb_articles: '/knowledge-base',
  incidents: '/incidents',
}

const CATEGORY_LABEL: Record<SystemHealth['category'], string> = {
  channel: 'Channels',
  system_of_record: 'Systems of Record',
}

function SystemCard({ system }: { system: SystemHealth }) {
  const [expanded, setExpanded] = useState(system.category === 'system_of_record')
  const style = STATUS_STYLES[system.status]

  return (
    <Card className='h-full overflow-hidden'>
      <CardHeader className='cursor-pointer select-none' onClick={() => setExpanded((v) => !v)}>
        <div className='flex items-center justify-between'>
          <CardTitle className='flex items-center gap-2 text-base'>
            {system.name}
            {system.tables && (
              <Icons.chevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
            )}
          </CardTitle>
          <div className='flex items-center gap-2'>
            <span className='text-[10px] text-muted-foreground'>{system.latency_ms}ms</span>
            <span className={cn('flex items-center gap-1.5 text-xs font-medium', style.text)}>
              <span className={cn('h-2 w-2 rounded-full', style.dot)} />
              {style.label}
            </span>
          </div>
        </div>
        <CardDescription>{system.role}</CardDescription>
      </CardHeader>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent>
              {system.status === 'not_configured' && system.missing_env.length > 0 && (
                <div className='mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3'>
                  <p className='mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-500'>
                    <Icons.alertCircle className='h-3.5 w-3.5' />
                    Setup needed — missing env vars
                  </p>
                  <ul className='space-y-1'>
                    {system.missing_env.map((key) => (
                      <li key={key} className='flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground'>
                        <Icons.circle className='h-2 w-2' />
                        {key}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!system.tables && <p className='text-xs text-muted-foreground'>{system.detail}</p>}

              {system.tables && (
                <div className='max-h-64 space-y-1 overflow-y-auto pr-1'>
                  {system.tables.map((t) => {
                    const href = TABLE_LINKS[t.name]
                    const row = (
                      <div
                        className={cn(
                          'flex items-center justify-between rounded-md px-2 py-1.5 text-xs',
                          href ? 'cursor-pointer hover:bg-muted/20' : ''
                        )}
                      >
                        <span className='font-mono text-muted-foreground'>{t.name}</span>
                        <span className='flex items-center gap-1 font-semibold'>
                          {t.count ?? '—'}
                          {href && <Icons.arrowRight className='h-3 w-3 text-brand-cornflower' />}
                        </span>
                      </div>
                    )
                    return href ? (
                      <Link key={t.name} href={href}>
                        {row}
                      </Link>
                    ) : (
                      <div key={t.name}>{row}</div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

export default function DataManagerPage() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<HealthResponse>('/api/data-manager/health')
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load system health')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 15000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const secondsAgo = data ? Math.max(0, Math.round((now - new Date(data.checked_at).getTime()) / 1000)) : null
  const healthyCount = data?.systems.filter((s) => s.status === 'up').length ?? 0
  const totalCount = data?.systems.length ?? 0

  const channels = data?.systems.filter((s) => s.category === 'channel') ?? []
  const systemsOfRecord = data?.systems.filter((s) => s.category === 'system_of_record') ?? []

  return (
    <motion.div className='space-y-8' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex items-center justify-between'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>Data Manager</h1>
          <p className='mt-2 text-lg text-muted-foreground'>
            Live health of every system the AI Employee connects to.
          </p>
        </div>
        <div className='flex shrink-0 items-center gap-3'>
          <div className='flex items-center gap-2 rounded-full border border-border bg-muted/10 px-3 py-1.5 text-xs text-muted-foreground'>
            <span className='relative flex h-2 w-2'>
              <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
              <span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-500' />
            </span>
            <span className='font-medium text-foreground'>Live</span>
            {secondsAgo !== null && <span>· updated {secondsAgo}s ago</span>}
          </div>
          <Button variant='outline' size='sm' onClick={() => load()} disabled={loading}>
            <Icons.refresh className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
            Recheck
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

      {data && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className='flex items-center gap-3 py-4'>
              <span
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl text-white',
                  healthyCount === totalCount ? 'bg-emerald-500' : 'bg-amber-500'
                )}
              >
                <Icons.network className='h-5 w-5' strokeWidth={1.5} />
              </span>
              <div>
                <p className='font-display text-lg font-bold text-brand-navy'>
                  {healthyCount}/{totalCount} systems healthy
                </p>
                <p className='text-xs text-muted-foreground'>
                  {systemsOfRecord.reduce((acc, s) => acc + (s.tables?.length ?? 0), 0)} tables tracked across systems of record
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {systemsOfRecord.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className='mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground'>
            {CATEGORY_LABEL.system_of_record}
          </h2>
          <div className='grid gap-4'>
            {systemsOfRecord.map((system) => (
              <SystemCard key={system.name} system={system} />
            ))}
          </div>
        </motion.div>
      )}

      {channels.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className='mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground'>
            {CATEGORY_LABEL.channel}
          </h2>
          <div className='grid gap-4 md:grid-cols-2'>
            {channels.map((system) => (
              <SystemCard key={system.name} system={system} />
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
