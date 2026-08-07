'use client'

import { useState, useRef, useEffect, memo } from 'react'
import dynamic from 'next/dynamic'
import { motion, useInView } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CardWatermark } from '@/components/ui/card-watermark'
import { Skeleton } from '@/components/ui/skeleton'
import { Icons } from '@/components/ui/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatTimestamp } from '@/lib/format'
import { useDashboardKPIs } from '@/hooks'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Recharts is a heavy dependency the initial paint doesn't need — split it
// into its own chunk, loaded client-side only, with a skeleton in the meantime.
const VolumeChart = dynamic(() => import('@/components/dashboard/VolumeChart'), {
  ssr: false,
  loading: () => (
    <Card className='relative overflow-hidden'>
      <CardContent className='pt-6'>
        <Skeleton className='h-[240px] w-full' />
      </CardContent>
    </Card>
  ),
})

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
}

// Animated number component — re-animates from its previous value every
// time `value` changes (not just on mount), so live polling updates read
// as motion instead of a snap.
function AnimatedNumber({
  value,
  suffix = '',
  duration = 800,
}: {
  value: number
  suffix?: string
  duration?: number
}) {
  const [displayValue, setDisplayValue] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 })
  const prevValue = useRef(0)

  useEffect(() => {
    if (!isInView) return

    const from = prevValue.current
    const to = value
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(2, -10 * progress)

      setDisplayValue(Math.round(from + (to - from) * eased))

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        setDisplayValue(to)
        prevValue.current = to
      }
    }

    requestAnimationFrame(animate)
  }, [value, duration, isInView])

  const formatValue = (num: number): string => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toString()
  }

  return (
    <span ref={ref}>
      {formatValue(displayValue)}
      {suffix}
    </span>
  )
}

// Stats Card Component with Bento styling
interface StatCardProps {
  title: string
  value: number | null
  suffix?: string
  icon: React.ElementType
  colorClass: string
  delay?: number
}

const StatCard = memo(function StatCard({ title, value, suffix = '', icon: Icon, colorClass, delay = 0 }: StatCardProps) {
  const prevValue = useRef<number | null>(null)
  const [justChanged, setJustChanged] = useState(false)

  useEffect(() => {
    if (value !== null && prevValue.current !== null && prevValue.current !== value) {
      setJustChanged(true)
      const t = setTimeout(() => setJustChanged(false), 700)
      prevValue.current = value
      return () => clearTimeout(t)
    }
    prevValue.current = value
  }, [value])

  return (
    <motion.div
      variants={itemVariants}
      initial='hidden'
      animate='visible'
      transition={{ delay }}
      whileHover={{ y: -4 }}
    >
      <Card
        className={cn(
          'group relative h-full cursor-default overflow-hidden transition-shadow duration-700',
          justChanged && 'ring-2 ring-brand-cornflower/60 shadow-[0_0_20px_rgba(138,162,223,0.4)]'
        )}
      >
        <CardWatermark opacity={3} scale={0.9} />
        <CardContent className='relative z-10 p-5'>
          <div className='flex items-start justify-between'>
            <div className='space-y-2'>
              <p className='text-micro uppercase text-brand-muted transition-colors duration-200 group-hover:text-brand-cornflower'>
                {title}
              </p>
              <p className='font-display text-[2.25rem] font-bold leading-none tracking-tight text-brand-navy'>
                {value === null ? (
                  <span className='text-lg text-muted-foreground'>n/a</span>
                ) : (
                  <AnimatedNumber value={value} suffix={suffix} />
                )}
              </p>
            </div>
            <motion.div
              className={cn('rounded-xl p-2.5 text-white', 'shadow-lg', colorClass)}
              whileHover={{ scale: 1.15, rotate: 5 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <Icon className='h-5 w-5' strokeWidth={1.5} />
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
})

// Hero Section
function HeroSection({ userName }: { userName?: string }) {
  const firstName = userName?.split(' ')[0] || 'there'

  return (
    <motion.div
      className='col-span-12 py-2'
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <h1 className='text-display-3 font-bold tracking-tight text-brand-navy lg:text-display-2'>
        Where Intelligence <br className='hidden sm:block' />
        <span className='text-gradient'>Meets Human.</span>
      </h1>
      <p className='mt-4 text-lg font-light text-muted-foreground'>
        Welcome back, {firstName}. Your AI Command Center is ready.
      </p>
    </motion.div>
  )
}

function DepartmentBreakdown({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const max = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Icons.users className='h-5 w-5 text-brand-cornflower' strokeWidth={1.5} />
          Tickets by Department
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        {entries.length === 0 && <p className='text-sm text-muted-foreground'>No data yet</p>}
        {entries.map(([dept, count]) => (
          <div key={dept}>
            <div className='mb-1 flex items-center justify-between text-xs'>
              <span className='font-medium'>{dept}</span>
              <span className='text-muted-foreground'>{count}</span>
            </div>
            <div className='h-2 w-full overflow-hidden rounded-full bg-muted/30'>
              <div
                className='h-full rounded-full bg-brand-cornflower'
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export default function HomePage() {
  const { kpis, loading, error, reload } = useDashboardKPIs()

  return (
    <motion.div className='space-y-6' variants={containerVariants} initial='hidden' animate='visible'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <HeroSection userName='Developer' />
        <div className='flex shrink-0 items-center gap-3'>
          <div className='flex items-center gap-2 rounded-full border border-border bg-muted/10 px-2 py-1 text-[11px] text-muted-foreground sm:px-3 sm:py-1.5 sm:text-xs'>
            <span className='relative flex h-2 w-2'>
              <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
              <span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-500' />
            </span>
            <span className='font-medium text-foreground'>Live</span>
            {kpis && <span>· updated {formatTimestamp(kpis.computed_at)}</span>}
          </div>
          <Button variant='outline' size='sm' onClick={() => reload()} disabled={loading}>
            <Icons.refresh className={cn('sm:mr-2 h-4 w-4', loading && 'animate-spin')} />
            <span className='hidden sm:inline'>Refresh</span>
          </Button>
        </div>
      </div>

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

      <ErrorBoundary>
        {/* Stats Grid - Bento style, live from run_log */}
        <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
          <StatCard
            title='Total Tickets'
            value={kpis?.total_tickets ?? null}
            icon={Icons.fileText}
            colorClass='bg-brand-navy'
            delay={0.1}
          />
          <StatCard
            title='Auto-Resolution Rate'
            value={kpis?.auto_resolution_rate_pct ?? null}
            suffix='%'
            icon={Icons.zap}
            colorClass='bg-brand-cornflower'
            delay={0.2}
          />
          <StatCard
            title='SLA Compliance (intake)'
            value={kpis?.sla_compliance_pct_at_intake ?? null}
            suffix='%'
            icon={Icons.checkCircle}
            colorClass='bg-brand-purple'
            delay={0.3}
          />
          <StatCard
            title='Avg MTTR'
            value={kpis?.avg_mttr_minutes ?? null}
            suffix='min'
            icon={Icons.clock}
            colorClass='bg-gradient-to-br from-brand-navy to-brand-purple'
            delay={0.4}
          />
        </div>

        <div className='mt-6 grid gap-6 lg:grid-cols-3'>
          <motion.div variants={itemVariants} className='lg:col-span-2'>
            <VolumeChart data={kpis?.volume_by_day ?? []} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <DepartmentBreakdown data={kpis?.department_breakdown ?? {}} />
          </motion.div>
        </div>

        {kpis && (
          <motion.div variants={itemVariants} className='mt-6'>
            <Card>
              <CardContent className='flex flex-wrap items-center gap-6 py-4 text-sm'>
                <span>
                  <span className='font-semibold text-emerald-500'>{kpis.path_breakdown.auto}</span> auto-resolved
                </span>
                <span>
                  <span className='font-semibold text-amber-500'>{kpis.path_breakdown.human}</span> human-routed
                </span>
                <span>
                  <span className='font-semibold text-muted-foreground'>{kpis.path_breakdown.pending}</span> pending
                </span>
                <span>
                  <span className='font-semibold'>{kpis.vip_ticket_count}</span> VIP tickets
                </span>
                <span className='ml-auto text-xs text-muted-foreground'>
                  Computed {formatTimestamp(kpis.computed_at)}
                </span>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </ErrorBoundary>
    </motion.div>
  )
}
