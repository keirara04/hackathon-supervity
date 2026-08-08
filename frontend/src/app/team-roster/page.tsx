'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { useSearchFilter } from '@/hooks'
import { GuideBanner } from '@/components/GuideBanner'

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

interface AgentForm {
  agent_name: string
  agent_email: string
  team: string
  component: string
  shift: string
  on_call: boolean
  open_ticket_cap: number
  active: boolean
  role: string
  assignment_group: string
  region: string
}

const EMPTY_FORM: AgentForm = {
  agent_name: '',
  agent_email: '',
  team: '',
  component: '',
  shift: '',
  on_call: false,
  open_ticket_cap: 10,
  active: true,
  role: '',
  assignment_group: '',
  region: '',
}

function toForm(a: Agent): AgentForm {
  return {
    agent_name: a.agent_name,
    agent_email: a.agent_email ?? '',
    team: a.team ?? '',
    component: a.component ?? '',
    shift: a.shift ?? '',
    on_call: a.on_call,
    open_ticket_cap: a.open_ticket_cap,
    active: a.active,
    role: a.role ?? '',
    assignment_group: a.assignment_group ?? '',
    region: a.region ?? '',
  }
}

function formToPayload(f: AgentForm) {
  return {
    agent_name: f.agent_name.trim(),
    agent_email: f.agent_email.trim() || null,
    team: f.team.trim() || null,
    component: f.component.trim() || null,
    shift: f.shift.trim() || null,
    on_call: f.on_call,
    open_ticket_cap: f.open_ticket_cap,
    active: f.active,
    role: f.role.trim() || null,
    assignment_group: f.assignment_group.trim() || null,
    region: f.region.trim() || null,
  }
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

function AgentCard({ agent, onClick }: { agent: Agent; onClick: () => void }) {
  const utilization = agent.open_ticket_cap > 0 ? agent.current_load / agent.open_ticket_cap : 0
  return (
    <Card onClick={onClick} className='cursor-pointer hover:bg-muted/10'>
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
}

export default function TeamRosterPage() {
  return (
    <Suspense fallback={null}>
      <TeamRosterPageInner />
    </Suspense>
  )
}

function TeamRosterPageInner() {
  const searchParams = useSearchParams()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [detailAgent, setDetailAgent] = useState<Agent | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<AgentForm>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<AgentForm>(EMPTY_FORM)

  const { query, setQuery, filtered: visibleAgents } = useSearchFilter(
    agents,
    (a) => `${a.agent_name} ${a.team ?? ''} ${a.role ?? ''} ${a.region ?? ''}`
  )

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

  function openDetail(a: Agent) {
    setDetailAgent(a)
    setEditing(false)
    setEditForm(toForm(a))
  }

  async function saveEdit() {
    if (!detailAgent) return
    setSaving(true)
    setError(null)
    try {
      const updated = await apiClient.patch<Agent>(`/api/team-roster/${detailAgent.id}`, formToPayload(editForm))
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)))
      setDetailAgent((prev) => (prev ? { ...prev, ...updated } : prev))
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save agent')
    } finally {
      setSaving(false)
    }
  }

  async function deleteAgent() {
    if (!detailAgent) return
    setSaving(true)
    setError(null)
    try {
      await apiClient.delete(`/api/team-roster/${detailAgent.id}`)
      setAgents((prev) => prev.filter((a) => a.id !== detailAgent.id))
      setDetailAgent(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete agent')
    } finally {
      setSaving(false)
    }
  }

  async function createAgent() {
    setSaving(true)
    setError(null)
    try {
      const created = await apiClient.post<Agent>('/api/team-roster', formToPayload(createForm))
      setAgents((prev) => [...prev, { ...created, current_load: 0 }])
      setCreating(false)
      setCreateForm(EMPTY_FORM)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create agent')
    } finally {
      setSaving(false)
    }
  }

  const teams = Array.from(new Set(visibleAgents.map((a) => a.team).filter(Boolean))) as string[]
  const noTeamAgents = visibleAgents.filter((a) => !a.team)
  const existingTeamNames = Array.from(new Set(agents.map((a) => a.team).filter(Boolean))) as string[]

  return (
    <motion.div className='space-y-8' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>Team Roster</h1>
          <p className='mt-2 text-lg text-muted-foreground'>
            {agents.filter((a) => a.on_call).length} of {agents.length} agents on-call right now.
          </p>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <Button variant='gradient' size='sm' onClick={() => setCreating(true)}>
            <Icons.plus className='h-4 w-4 sm:mr-2' />
            <span className='hidden sm:inline'>Add Agent</span>
          </Button>
          <Button variant='outline' size='sm' onClick={load} disabled={loading}>
            <Icons.refresh className={cn('sm:mr-2 h-4 w-4', loading && 'animate-spin')} />
            <span className='hidden sm:inline'>Refresh</span>
          </Button>
        </div>
      </motion.div>

      <GuideBanner guide={searchParams.get('guide')} />

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
          placeholder='Search agent, team, role, region...'
          className='w-full rounded-full border border-border bg-muted/10 py-2 pl-9 pr-4 text-sm outline-none focus:border-primary/50 sm:max-w-sm'
        />
      </motion.div>

      {teams.map((team) => (
        <motion.div key={team} variants={itemVariants}>
          <h2 className='mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground'>{team}</h2>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {visibleAgents
              .filter((a) => a.team === team)
              .map((agent) => (
                <AgentCard key={agent.id} agent={agent} onClick={() => openDetail(agent)} />
              ))}
          </div>
        </motion.div>
      ))}

      {noTeamAgents.length > 0 && (
        <motion.div variants={itemVariants}>
          <h2 className='mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground'>No Team</h2>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {noTeamAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onClick={() => openDetail(agent)} />
            ))}
          </div>
        </motion.div>
      )}

      {!loading && agents.length === 0 && !error && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className='py-16 text-center text-sm text-muted-foreground'>No roster data.</CardContent>
          </Card>
        </motion.div>
      )}

      {!loading && agents.length > 0 && visibleAgents.length === 0 && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className='py-16 text-center text-sm text-muted-foreground'>No agents match this search.</CardContent>
          </Card>
        </motion.div>
      )}

      <datalist id='team-names'>
        {existingTeamNames.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <Dialog open={detailAgent !== null} onOpenChange={(open) => !open && setDetailAgent(null)}>
        <DialogContent>
          {detailAgent && (
            <>
              <DialogHeader>
                <DialogTitle>{editing ? 'Edit Agent' : detailAgent.agent_name}</DialogTitle>
                <DialogDescription>
                  {editing ? detailAgent.agent_name : `${detailAgent.role ?? 'No role'} · ${detailAgent.team ?? 'no team'}`}
                </DialogDescription>
              </DialogHeader>

              {editing ? (
                <div className='space-y-3'>
                  <div className='grid grid-cols-2 gap-3'>
                    <label className='text-xs'>
                      <span className='font-semibold text-foreground'>Name</span>
                      <input
                        value={editForm.agent_name}
                        onChange={(e) => setEditForm((f) => ({ ...f, agent_name: e.target.value }))}
                        className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                      />
                    </label>
                    <label className='text-xs'>
                      <span className='font-semibold text-foreground'>Email</span>
                      <input
                        value={editForm.agent_email}
                        onChange={(e) => setEditForm((f) => ({ ...f, agent_email: e.target.value }))}
                        className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                      />
                    </label>
                    <label className='text-xs'>
                      <span className='font-semibold text-foreground'>Team</span>
                      <input
                        value={editForm.team}
                        onChange={(e) => setEditForm((f) => ({ ...f, team: e.target.value }))}
                        list='team-names'
                        className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                      />
                    </label>
                    <label className='text-xs'>
                      <span className='font-semibold text-foreground'>Component</span>
                      <input
                        value={editForm.component}
                        onChange={(e) => setEditForm((f) => ({ ...f, component: e.target.value }))}
                        className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                      />
                    </label>
                    <label className='text-xs'>
                      <span className='font-semibold text-foreground'>Role</span>
                      <input
                        value={editForm.role}
                        onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                        className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                      />
                    </label>
                    <label className='text-xs'>
                      <span className='font-semibold text-foreground'>Region</span>
                      <input
                        value={editForm.region}
                        onChange={(e) => setEditForm((f) => ({ ...f, region: e.target.value }))}
                        className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                      />
                    </label>
                    <label className='text-xs'>
                      <span className='font-semibold text-foreground'>Shift</span>
                      <input
                        value={editForm.shift}
                        onChange={(e) => setEditForm((f) => ({ ...f, shift: e.target.value }))}
                        className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                      />
                    </label>
                    <label className='text-xs'>
                      <span className='font-semibold text-foreground'>Assignment group</span>
                      <input
                        value={editForm.assignment_group}
                        onChange={(e) => setEditForm((f) => ({ ...f, assignment_group: e.target.value }))}
                        className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                      />
                    </label>
                    <label className='text-xs'>
                      <span className='font-semibold text-foreground'>Open ticket cap</span>
                      <input
                        type='number'
                        value={editForm.open_ticket_cap}
                        onChange={(e) => setEditForm((f) => ({ ...f, open_ticket_cap: Number(e.target.value) }))}
                        className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                      />
                    </label>
                  </div>
                  <div className='flex items-center gap-4'>
                    <label className='flex items-center gap-2 text-xs'>
                      <input
                        type='checkbox'
                        checked={editForm.on_call}
                        onChange={(e) => setEditForm((f) => ({ ...f, on_call: e.target.checked }))}
                        className='h-4 w-4 rounded border-border accent-primary'
                      />
                      On-call
                    </label>
                    <label className='flex items-center gap-2 text-xs'>
                      <input
                        type='checkbox'
                        checked={editForm.active}
                        onChange={(e) => setEditForm((f) => ({ ...f, active: e.target.checked }))}
                        className='h-4 w-4 rounded border-border accent-primary'
                      />
                      Active
                    </label>
                  </div>
                  <div className='flex gap-2 pt-2'>
                    <Button variant='gradient' size='sm' onClick={saveEdit} disabled={saving || !editForm.agent_name.trim()}>
                      {saving ? <Icons.loader className='mr-2 h-4 w-4 animate-spin' /> : <Icons.check className='mr-2 h-4 w-4' />}
                      Save
                    </Button>
                    <Button variant='outline' size='sm' onClick={() => setEditing(false)} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className='grid grid-cols-2 gap-3 text-xs text-muted-foreground'>
                    <p><span className='font-semibold text-foreground'>Email:</span> {detailAgent.agent_email ?? '—'}</p>
                    <p><span className='font-semibold text-foreground'>Region:</span> {detailAgent.region ?? '—'}</p>
                    <p><span className='font-semibold text-foreground'>Shift:</span> {detailAgent.shift ?? '—'}</p>
                    <p><span className='font-semibold text-foreground'>Component:</span> {detailAgent.component ?? '—'}</p>
                    <p><span className='font-semibold text-foreground'>Assignment group:</span> {detailAgent.assignment_group ?? '—'}</p>
                    <p><span className='font-semibold text-foreground'>On-call:</span> {detailAgent.on_call ? 'Yes' : 'No'}</p>
                    <p><span className='font-semibold text-foreground'>Active:</span> {detailAgent.active ? 'Yes' : 'No'}</p>
                    <p><span className='font-semibold text-foreground'>Load:</span> {detailAgent.current_load} / {detailAgent.open_ticket_cap}</p>
                  </div>
                  <div className='flex gap-2 pt-2'>
                    <Button variant='outline' size='sm' onClick={() => setEditing(true)}>
                      <Icons.pencil className='mr-2 h-4 w-4' />
                      Edit
                    </Button>
                    <Button variant='destructive' size='sm' onClick={deleteAgent} disabled={saving}>
                      {saving ? <Icons.loader className='mr-2 h-4 w-4 animate-spin' /> : <Icons.trash className='mr-2 h-4 w-4' />}
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Agent</DialogTitle>
            <DialogDescription>New on-call agent for the roster.</DialogDescription>
          </DialogHeader>
          <div className='space-y-3'>
            <div className='grid grid-cols-2 gap-3'>
              <label className='text-xs'>
                <span className='font-semibold text-foreground'>Name*</span>
                <input
                  value={createForm.agent_name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, agent_name: e.target.value }))}
                  autoFocus
                  className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                />
              </label>
              <label className='text-xs'>
                <span className='font-semibold text-foreground'>Email</span>
                <input
                  value={createForm.agent_email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, agent_email: e.target.value }))}
                  className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                />
              </label>
              <label className='text-xs'>
                <span className='font-semibold text-foreground'>Team</span>
                <input
                  value={createForm.team}
                  onChange={(e) => setCreateForm((f) => ({ ...f, team: e.target.value }))}
                  list='team-names'
                  className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                />
              </label>
              <label className='text-xs'>
                <span className='font-semibold text-foreground'>Component</span>
                <input
                  value={createForm.component}
                  onChange={(e) => setCreateForm((f) => ({ ...f, component: e.target.value }))}
                  className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                />
              </label>
              <label className='text-xs'>
                <span className='font-semibold text-foreground'>Role</span>
                <input
                  value={createForm.role}
                  onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}
                  className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                />
              </label>
              <label className='text-xs'>
                <span className='font-semibold text-foreground'>Region</span>
                <input
                  value={createForm.region}
                  onChange={(e) => setCreateForm((f) => ({ ...f, region: e.target.value }))}
                  className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                />
              </label>
              <label className='text-xs'>
                <span className='font-semibold text-foreground'>Shift</span>
                <input
                  value={createForm.shift}
                  onChange={(e) => setCreateForm((f) => ({ ...f, shift: e.target.value }))}
                  className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                />
              </label>
              <label className='text-xs'>
                <span className='font-semibold text-foreground'>Assignment group</span>
                <input
                  value={createForm.assignment_group}
                  onChange={(e) => setCreateForm((f) => ({ ...f, assignment_group: e.target.value }))}
                  className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                />
              </label>
              <label className='text-xs'>
                <span className='font-semibold text-foreground'>Open ticket cap</span>
                <input
                  type='number'
                  value={createForm.open_ticket_cap}
                  onChange={(e) => setCreateForm((f) => ({ ...f, open_ticket_cap: Number(e.target.value) }))}
                  className='mt-1 w-full rounded-lg border border-border bg-muted/10 px-2 py-1.5 text-sm outline-none focus:border-primary/50'
                />
              </label>
            </div>
            <div className='flex items-center gap-4'>
              <label className='flex items-center gap-2 text-xs'>
                <input
                  type='checkbox'
                  checked={createForm.on_call}
                  onChange={(e) => setCreateForm((f) => ({ ...f, on_call: e.target.checked }))}
                  className='h-4 w-4 rounded border-border accent-primary'
                />
                On-call
              </label>
              <label className='flex items-center gap-2 text-xs'>
                <input
                  type='checkbox'
                  checked={createForm.active}
                  onChange={(e) => setCreateForm((f) => ({ ...f, active: e.target.checked }))}
                  className='h-4 w-4 rounded border-border accent-primary'
                />
                Active
              </label>
            </div>
            <div className='flex gap-2 pt-2'>
              <Button variant='gradient' size='sm' onClick={createAgent} disabled={saving || !createForm.agent_name.trim()}>
                {saving ? <Icons.loader className='mr-2 h-4 w-4 animate-spin' /> : <Icons.plus className='mr-2 h-4 w-4' />}
                Add Agent
              </Button>
              <Button variant='outline' size='sm' onClick={() => setCreating(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
