'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { AlertTriangle, AlertCircle, Info, Sparkles, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'

type Severity = 'critical' | 'warning' | 'info'
type InsightType = 'pattern' | 'anomaly' | 'recommendation' | 'self_learning' | 'ai_synthesis'

interface Insight {
  type: InsightType
  severity: Severity
  title: string
  description: string
  action: string
  confidence: number
  suggested_patch?: Record<string, unknown>
}

interface InsightsResponse {
  insights: Insight[]
  generated_from: { policy_evaluations: number; run_log_rows: number }
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
}
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

const SEVERITY_STYLES: Record<Severity, { badge: string; icon: LucideIcon; dot: string }> = {
  critical: { badge: 'bg-red-500/15 text-red-400', icon: AlertTriangle, dot: 'bg-red-500' },
  warning: { badge: 'bg-amber-500/15 text-amber-400', icon: AlertCircle, dot: 'bg-amber-500' },
  info: { badge: 'bg-brand-cornflower/15 text-brand-cornflower', icon: Info, dot: 'bg-brand-cornflower' },
}

const TYPE_LABEL: Record<InsightType, string> = {
  pattern: 'Pattern',
  anomaly: 'Anomaly',
  recommendation: 'Recommendation',
  self_learning: 'Self-Learning',
  ai_synthesis: 'AI Synthesis',
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aiInsight, setAiInsight] = useState<Insight | null>(null)
  const [aiLoading, setAiLoading] = useState(true)
  const [applying, setApplying] = useState<number | null>(null)
  const [appliedIdx, setAppliedIdx] = useState<Set<number>>(new Set())
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const [diagnosis, setDiagnosis] = useState<string | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnoseError, setDiagnoseError] = useState<string | null>(null)

  // Deterministic insights load first and render immediately — the AI
  // synthesis insight is fetched separately (own endpoint, cached on the
  // backend) so a slow/cold OpenRouter call never blocks the page.
  const loadInsights = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<InsightsResponse>('/api/insights?limit=500')
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load insights')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSynthesis = useCallback(async () => {
    setAiLoading(true)
    try {
      const res = await apiClient.get<{ insight: Insight | null }>('/api/insights/synthesis')
      setAiInsight(res.insight)
    } catch {
      setAiInsight(null)
    } finally {
      setAiLoading(false)
    }
  }, [])

  const load = useCallback(() => {
    loadInsights()
    loadSynthesis()
  }, [loadInsights, loadSynthesis])

  useEffect(() => {
    load()
  }, [load])

  const insights = useMemo(
    () => (aiInsight ? [...(data?.insights ?? []), aiInsight] : data?.insights ?? []),
    [data, aiInsight]
  )

  async function applyPatch(idx: number, patch: Record<string, unknown>) {
    setApplying(idx)
    try {
      await apiClient.patch('/api/policies', patch)
      setAppliedIdx((prev) => new Set(prev).add(idx))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply policy change')
    } finally {
      setApplying(null)
    }
  }

  function openModal(idx: number) {
    setActiveIdx(idx)
    setDiagnosis(null)
    setDiagnoseError(null)
  }

  async function getDiagnosis(insight: Insight) {
    setDiagnosing(true)
    setDiagnoseError(null)
    try {
      const res = await apiClient.post<{ diagnosis: string }>('/api/insights/diagnose', {
        title: insight.title,
        description: insight.description,
        type: insight.type,
      })
      setDiagnosis(res.diagnosis)
    } catch (e) {
      setDiagnoseError(e instanceof Error ? e.message : 'Failed to get diagnosis')
    } finally {
      setDiagnosing(false)
    }
  }

  const activeInsight = activeIdx !== null ? insights[activeIdx] ?? null : null

  return (
    <motion.div className='space-y-8' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>AI Insights</h1>
          <p className='mt-2 text-lg text-muted-foreground'>
            Patterns and recommendations computed from the pipeline&apos;s own data — not seeded.
          </p>
        </div>
        <Button variant='outline' size='sm' onClick={load} disabled={loading}>
          <Icons.refresh className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          Refresh
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

      {data && (
        <motion.div variants={itemVariants}>
          <p className='text-sm text-muted-foreground'>
            Computed from {data.generated_from.policy_evaluations} policy evaluations and{' '}
            {data.generated_from.run_log_rows} run_log rows.
          </p>
        </motion.div>
      )}

      {!loading && insights.length === 0 && !aiLoading && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className='py-16 text-center text-sm text-muted-foreground'>
              Not enough data yet to generate insights — run the pipeline first.
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className='grid gap-6 md:grid-cols-2'>
        {insights.map((insight, i) => {
          const style = SEVERITY_STYLES[insight.severity]
          const Icon = style.icon
          const isAi = insight.type === 'ai_synthesis'
          return (
            <motion.div key={i} variants={itemVariants}>
              <Card
                className={cn(
                  'h-full cursor-pointer transition-shadow hover:shadow-md',
                  isAi && 'border-brand-cornflower/40 bg-gradient-to-br from-brand-cornflower/5 to-transparent'
                )}
                onClick={() => openModal(i)}
              >
                <CardHeader>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='flex items-center gap-2'>
                      {isAi ? (
                        <Sparkles className='h-3.5 w-3.5 text-brand-cornflower' />
                      ) : (
                        <span className={cn('h-2 w-2 rounded-full', style.dot)} />
                      )}
                      <span className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                        {TYPE_LABEL[insight.type]}
                      </span>
                    </div>
                    <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', style.badge)}>
                      <Icon className='h-3 w-3' />
                      {insight.severity}
                    </span>
                  </div>
                  <CardTitle className='mt-2 text-base'>{insight.title}</CardTitle>
                  <CardDescription className='line-clamp-3'>{insight.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className='flex items-center justify-between rounded-lg bg-muted/20 p-3'>
                    <p className='line-clamp-2 text-sm'>
                      <span className='font-semibold'>Action: </span>
                      {insight.action}
                    </p>
                  </div>
                  <div className='mt-2 flex items-center justify-between'>
                    {insight.type === 'self_learning' && insight.suggested_patch ? (
                      appliedIdx.has(i) ? (
                        <span className='flex items-center gap-1 text-xs font-medium text-emerald-500'>
                          <Icons.checkCircle className='h-3.5 w-3.5' />
                          Applied
                        </span>
                      ) : (
                        <Button
                          variant='gradient'
                          size='sm'
                          disabled={applying === i}
                          onClick={(e) => {
                            e.stopPropagation()
                            applyPatch(i, insight.suggested_patch!)
                          }}
                        >
                          {applying === i ? (
                            <Icons.loader className='mr-2 h-3.5 w-3.5 animate-spin' />
                          ) : (
                            <Icons.zap className='mr-2 h-3.5 w-3.5' />
                          )}
                          Apply this change
                        </Button>
                      )
                    ) : (
                      <span />
                    )}
                    <p className='text-xs text-muted-foreground'>confidence {Math.round(insight.confidence * 100)}%</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
        {aiLoading && !aiInsight && (
          <motion.div variants={itemVariants}>
            <Card className='flex h-full min-h-[180px] items-center justify-center border-brand-cornflower/30 border-dashed'>
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <Sparkles className='h-4 w-4 animate-pulse text-brand-cornflower' />
                Synthesizing AI insight…
              </div>
            </Card>
          </motion.div>
        )}
      </div>

      <Dialog open={activeIdx !== null} onOpenChange={(open) => !open && setActiveIdx(null)}>
        <DialogContent className='max-w-lg'>
          {activeInsight && (
            <>
              <DialogHeader>
                <div className='flex items-center gap-2'>
                  {activeInsight.type === 'ai_synthesis' ? (
                    <Sparkles className='h-4 w-4 text-brand-cornflower' />
                  ) : (
                    <span className={cn('h-2 w-2 rounded-full', SEVERITY_STYLES[activeInsight.severity].dot)} />
                  )}
                  <span className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                    {TYPE_LABEL[activeInsight.type]}
                  </span>
                  <span
                    className={cn(
                      'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                      SEVERITY_STYLES[activeInsight.severity].badge
                    )}
                  >
                    {activeInsight.severity}
                  </span>
                </div>
                <DialogTitle>{activeInsight.title}</DialogTitle>
                <DialogDescription>{activeInsight.description}</DialogDescription>
              </DialogHeader>

              <div className='space-y-4'>
                <div className='rounded-lg bg-muted/20 p-3'>
                  <p className='text-sm'>
                    <span className='font-semibold'>Action: </span>
                    {activeInsight.action}
                  </p>
                </div>

                <p className='text-xs text-muted-foreground'>
                  Confidence {Math.round(activeInsight.confidence * 100)}%
                </p>

                {activeInsight.type === 'self_learning' && activeInsight.suggested_patch && (
                  <div>
                    {appliedIdx.has(activeIdx!) ? (
                      <span className='flex items-center gap-1 text-xs font-medium text-emerald-500'>
                        <Icons.checkCircle className='h-3.5 w-3.5' />
                        Applied
                      </span>
                    ) : (
                      <Button
                        variant='gradient'
                        size='sm'
                        disabled={applying === activeIdx}
                        onClick={() => applyPatch(activeIdx!, activeInsight.suggested_patch!)}
                      >
                        {applying === activeIdx ? (
                          <Icons.loader className='mr-2 h-3.5 w-3.5 animate-spin' />
                        ) : (
                          <Icons.zap className='mr-2 h-3.5 w-3.5' />
                        )}
                        Apply this change
                      </Button>
                    )}
                  </div>
                )}

                <div className='space-y-2 border-t pt-4'>
                  {!diagnosis && (
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={diagnosing}
                      onClick={() => getDiagnosis(activeInsight)}
                    >
                      {diagnosing ? (
                        <Icons.loader className='mr-2 h-3.5 w-3.5 animate-spin' />
                      ) : (
                        <Sparkles className='mr-2 h-3.5 w-3.5' />
                      )}
                      {diagnosing ? 'Diagnosing…' : 'Get AI Diagnosis'}
                    </Button>
                  )}
                  {diagnoseError && (
                    <p className='flex items-center gap-1 text-sm text-red-400'>
                      <Icons.alertTriangle className='h-3.5 w-3.5' />
                      {diagnoseError}
                    </p>
                  )}
                  {diagnosis && (
                    <div className='rounded-lg border border-brand-cornflower/30 bg-brand-cornflower/5 p-3'>
                      <p className='mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-brand-cornflower'>
                        <Sparkles className='h-3 w-3' />
                        AI Diagnosis
                      </p>
                      <p className='text-sm'>{diagnosis}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
