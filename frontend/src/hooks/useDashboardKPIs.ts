'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'

export interface DashboardKPIs {
  total_tickets: number
  path_breakdown: { auto: number; human: number; pending: number }
  auto_resolution_rate_pct: number | null
  sla_compliance_pct_at_intake: number | null
  avg_mttr_minutes: number | null
  resolved_count: number
  vip_ticket_count: number
  volume_by_day: { date: string; count: number }[]
  department_breakdown: Record<string, number>
  channel_breakdown: Record<string, number>
  computed_at: string
}

/**
 * Owns fetching + 15s polling of live Dashboard KPIs. `silent` polls don't
 * flip the loading flag, so the background refresh doesn't flicker the
 * manual-refresh spinner.
 */
export function useDashboardKPIs() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<DashboardKPIs>('/api/dashboard/kpis')
      setKpis(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard KPIs')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 15000)
    return () => clearInterval(interval)
  }, [load])

  return { kpis, loading, error, reload: load }
}
