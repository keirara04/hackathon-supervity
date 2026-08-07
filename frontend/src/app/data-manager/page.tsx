'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'

interface SystemHealth {
  name: string
  role: string
  status: 'up' | 'down' | 'not_configured'
  detail: string
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
  not_configured: { dot: 'bg-gray-400', label: 'Not configured', text: 'text-muted-foreground' },
}

export default function DataManagerPage() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<HealthResponse>('/api/data-manager/health')
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load system health')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <motion.div className='space-y-8' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex items-center justify-between'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>Data Manager</h1>
          <p className='mt-2 text-lg text-muted-foreground'>
            Live health of every system the AI Employee connects to.
          </p>
        </div>
        <Button variant='outline' size='sm' onClick={load} disabled={loading}>
          <Icons.refresh className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          Recheck
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

      <div className='grid gap-6 md:grid-cols-3'>
        {data?.systems.map((system) => {
          const style = STATUS_STYLES[system.status]
          return (
            <motion.div key={system.name} variants={itemVariants}>
              <Card className='h-full'>
                <CardHeader>
                  <div className='flex items-center justify-between'>
                    <CardTitle className='text-base'>{system.name}</CardTitle>
                    <span className={cn('flex items-center gap-1.5 text-xs font-medium', style.text)}>
                      <span className={cn('h-2 w-2 rounded-full', style.dot)} />
                      {style.label}
                    </span>
                  </div>
                  <CardDescription>{system.role}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className='text-xs text-muted-foreground'>{system.detail}</p>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {data && (
        <motion.div variants={itemVariants}>
          <p className='text-xs text-muted-foreground'>
            Last checked {new Date(data.checked_at).toLocaleString()}
          </p>
        </motion.div>
      )}
    </motion.div>
  )
}
