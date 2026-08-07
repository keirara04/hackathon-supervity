'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'

export interface Enrichment {
  ticket_id: string
  is_vip: boolean | null
  department: string | null
  sla_state_before: string | null
  hours_to_breach: number | null
}

export interface WorkbenchTask {
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
  enrichment: Enrichment | null
}

/**
 * Owns fetching the open queue + merged history (approved/modified/rejected)
 * for the Workbench page — the parallel Promise.all across 4 status filters.
 */
export function useWorkbenchQueue() {
  const [tasks, setTasks] = useState<WorkbenchTask[]>([])
  const [history, setHistory] = useState<WorkbenchTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [queueRes, ...historyRes] = await Promise.all([
        apiClient.get<{ tasks: WorkbenchTask[] }>('/api/workbench?status=open&limit=100'),
        apiClient.get<{ tasks: WorkbenchTask[] }>('/api/workbench?status=approved&limit=50'),
        apiClient.get<{ tasks: WorkbenchTask[] }>('/api/workbench?status=modified&limit=50'),
        apiClient.get<{ tasks: WorkbenchTask[] }>('/api/workbench?status=rejected&limit=50'),
      ])
      setTasks(queueRes.tasks)
      const merged = historyRes
        .flatMap((r) => r.tasks)
        .sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''))
      setHistory(merged)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workbench queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { tasks, history, loading, error, reload: load }
}
