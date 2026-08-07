'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'

interface Agent {
  id: number
  agent_name: string
  agent_email: string | null
  team: string | null
  component: string | null
  shift: string | null
  on_call: boolean
  open_ticket_cap: number
  active: boolean
  role: string | null
  assignment_group: string | null
  region: string | null
  current_load: number
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

export default function TeamRosterPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<{ agents: Agent[]; count: number }>('/api/team-roster')
      setAgents(res.agents)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load team roster')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const teams = Array.from(new Set(agents.map((a) => a.team).filter(Boolean))) as string[]

  return (
    <motion.div className='space-y-8' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>Team Roster</h1>
          <p className='mt-2 text-lg text-muted-foreground'>
            {agents.filter((a) => a.on_call).length} of {agents.length} agents on-call right now.
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

      {teams.map((team) => (
        <motion.div key={team} variants={itemVariants}>
          <h2 className='mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground'>{team}</h2>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {agents
              .filter((a) => a.team === team)
              .map((agent) => {
                const utilization = agent.open_ticket_cap > 0 ? agent.current_load / agent.open_ticket_cap : 0
                return (
                  <Card key={agent.id}>
                    <CardHeader className='pb-2'>
                      <div className='flex items-center justify-between'>
                        <CardTitle className='text-sm'>{agent.agent_name}</CardTitle>
                        {agent.on_call && (
                          <span className='flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-500'>
                            <span className='h-1.5 w-1.5 rounded-full bg-emerald-500' />
                            On-call
                          </span>
                        )}
                      </div>
                      <CardDescription>
                        {agent.role} · {agent.region ?? 'unknown region'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-2'>
                      <div className='flex items-center justify-between text-xs'>
                        <span className='text-muted-foreground'>Open tickets</span>
                        <span className='font-semibold'>
                          {agent.current_load} / {agent.open_ticket_cap}
                        </span>
                      </div>
                      <div className='h-2 w-full overflow-hidden rounded-full bg-muted/30'>
                        <div
                          className={cn(
                            'h-full rounded-full',
                            utilization >= 1 ? 'bg-red-500' : utilization >= 0.7 ? 'bg-amber-500' : 'bg-emerald-500'
                          )}
                          style={{ width: `${Math.min(utilization * 100, 100)}%` }}
                        />
                      </div>
                      {agent.assignment_group && (
                        <p className='text-[11px] text-muted-foreground'>{agent.assignment_group}</p>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        </motion.div>
      ))}

      {!loading && agents.length === 0 && !error && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className='py-16 text-center text-sm text-muted-foreground'>No roster data.</CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  )
}
