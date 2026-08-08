'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Icons } from '@/components/ui/icons'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type NotificationType = 'info' | 'success' | 'warning' | 'error'

type NotificationSource = 'Incident' | 'Workbench' | 'Health'

interface Notification {
  id: string
  type: NotificationType
  source: NotificationSource
  title: string
  message: string
  timestamp: Date
  href: string
}

const READ_IDS_KEY = 'notif_read_ids'
const POLL_MS = 30000

function loadReadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(READ_IDS_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(READ_IDS_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
}

interface IncidentRow {
  incident_id: string
  title: string
  severity: string
  status: string
  child_count: number
  opened_at: string
}

interface WorkbenchTaskRow {
  task_id: string
  created_at: string
  enrichment: { is_vip: boolean | null; department: string | null } | null
  context: Record<string, unknown>
}

interface HealthSystem {
  name: string
  status: string
  detail: string
}

async function fetchLiveNotifications(): Promise<Notification[]> {
  const results: Notification[] = []

  const [incidentsRes, workbenchRes, healthRes] = await Promise.allSettled([
    apiClient.get<{ incidents: IncidentRow[] }>('/api/incidents'),
    apiClient.get<{ tasks: WorkbenchTaskRow[]; count: number }>('/api/workbench?status=open&limit=50'),
    apiClient.get<{ systems: HealthSystem[] }>('/api/data-manager/health'),
  ])

  if (incidentsRes.status === 'fulfilled') {
    for (const inc of incidentsRes.value.incidents.filter((i) => i.status === 'open')) {
      results.push({
        id: `incident-${inc.incident_id}`,
        type: inc.severity === 'high' || inc.severity === 'critical' ? 'error' : 'warning',
        source: 'Incident',
        title: inc.title,
        message: `${inc.child_count} related tickets sharing this cluster are currently unresolved. Severity: ${inc.severity}.`,
        timestamp: new Date(inc.opened_at),
        href: '/incidents',
      })
    }
  }

  if (workbenchRes.status === 'fulfilled') {
    const { tasks, count } = workbenchRes.value
    if (count > 0) {
      results.push({
        id: 'workbench-open',
        type: 'warning',
        source: 'Workbench',
        title: `${count} ticket${count === 1 ? '' : 's'} waiting for review`,
        message: 'Human review needed before these can proceed through the pipeline.',
        timestamp: new Date(),
        href: '/workbench',
      })
    }
    for (const t of tasks.filter((t) => t.enrichment?.is_vip)) {
      results.push({
        id: `workbench-vip-${t.task_id}`,
        type: 'error',
        source: 'Workbench',
        title: 'VIP ticket waiting for review',
        message: `Department: ${t.enrichment?.department ?? 'unknown'}. VIP tickets should be prioritized.`,
        timestamp: new Date(t.created_at),
        href: '/workbench',
      })
    }
  }

  if (healthRes.status === 'fulfilled') {
    for (const sys of healthRes.value.systems.filter((s) => s.status !== 'up')) {
      results.push({
        id: `health-${sys.name}`,
        type: 'error',
        source: 'Health',
        title: `${sys.name} integration is down`,
        message: sys.detail || 'Health check failing — check credentials and connectivity.',
        timestamp: new Date(),
        href: '/data-manager',
      })
    }
  }

  return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

const typeConfig: Record<
  NotificationType,
  { icon: React.ElementType; color: string; bg: string; label: string; badge: string }
> = {
  info: {
    icon: Icons.info,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    label: 'Info',
    badge: 'bg-blue-500/15 text-blue-500',
  },
  success: {
    icon: Icons.checkCircle,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    label: 'Resolved',
    badge: 'bg-emerald-500/15 text-emerald-500',
  },
  warning: {
    icon: Icons.alertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    label: 'Warning',
    badge: 'bg-amber-500/15 text-amber-500',
  },
  error: {
    icon: Icons.alertCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    label: 'Critical',
    badge: 'bg-red-500/15 text-red-500',
  },
}

const sourceConfig: Record<NotificationSource, { icon: React.ElementType; label: string }> = {
  Incident: { icon: Icons.alertTriangle, label: 'Incident' },
  Workbench: { icon: Icons.workbench, label: 'Workbench' },
  Health: { icon: Icons.network, label: 'System Health' },
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

interface NotificationItemProps {
  notification: Notification
  read: boolean
  onOpen: (id: string) => void
}

function NotificationItem({ notification, read, onOpen }: NotificationItemProps) {
  const config = typeConfig[notification.type]
  const source = sourceConfig[notification.source]
  const Icon = config.icon
  const SourceIcon = source.icon

  return (
    <Link
      href={notification.href}
      onClick={() => onOpen(notification.id)}
      className={cn(
        'group flex cursor-pointer gap-3 rounded-xl border p-4',
        'transition-all duration-200 ease-out',
        'hover:shadow-sm',
        read
          ? 'border-transparent opacity-60 hover:border-border/50 hover:opacity-100'
          : 'border-border/40 bg-muted/10 hover:border-brand-cornflower/30 hover:bg-brand-cornflower/5'
      )}
    >
      <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg', config.bg)}>
        <Icon className={cn('h-5 w-5', config.color)} strokeWidth={1.5} />
      </div>
      <div className='min-w-0 flex-1 space-y-1.5'>
        <div className='flex items-center gap-2'>
          <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', config.badge)}>
            {config.label}
          </span>
          <span className='flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground'>
            <SourceIcon className='h-3 w-3' />
            {source.label}
          </span>
          {!read && <span className='ml-auto h-2 w-2 shrink-0 animate-pulse rounded-full bg-brand-cornflower' />}
        </div>
        <p className='text-sm font-medium leading-snug text-foreground'>{notification.title}</p>
        <p className='text-xs leading-relaxed text-muted-foreground'>{notification.message}</p>
        <div className='flex items-center justify-between pt-0.5'>
          <p className='text-[10px] text-muted-foreground/60'>{formatRelativeTime(notification.timestamp)}</p>
          <span className='flex items-center gap-0.5 text-[10px] font-medium text-brand-cornflower opacity-0 transition-opacity group-hover:opacity-100'>
            View <Icons.chevronRight className='h-3 w-3' />
          </span>
        </div>
      </div>
    </Link>
  )
}

export function NotificationCenter() {
  const [notifications, setNotifications] = React.useState<Notification[]>([])
  const [readIds, setReadIds] = React.useState<Set<string>>(() => loadReadIds())

  const load = React.useCallback(async () => {
    try {
      const items = await fetchLiveNotifications()
      setNotifications(items)
    } catch {
      // silent — never fabricate notifications on fetch failure
    }
  }, [])

  React.useEffect(() => {
    load()
    const interval = setInterval(load, POLL_MS)
    return () => clearInterval(interval)
  }, [load])

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length

  const markAsRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev).add(id)
      saveReadIds(next)
      return next
    })
  }

  const markAllAsRead = () => {
    setReadIds((prev) => {
      const next = new Set(prev)
      notifications.forEach((n) => next.add(n.id))
      saveReadIds(next)
      return next
    })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='relative rounded-full text-muted-foreground hover:text-foreground'
        >
          <Icons.bell className='h-5 w-5' strokeWidth={1.5} />
          {unreadCount > 0 && (
            <span
              className={cn(
                'absolute -right-0.5 -top-0.5',
                'flex h-4 min-w-4 items-center justify-center',
                'rounded-full bg-destructive px-1',
                'text-[10px] font-semibold text-white',
                'animate-badge-bounce'
              )}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-[calc(100vw-2rem)] max-w-[420px] p-0'>
        {/* Header */}
        <div className='flex items-center justify-between border-b border-border/50 px-5 py-4'>
          <div>
            <h3 className='font-display font-semibold text-foreground'>Notifications</h3>
            <p className='mt-0.5 text-xs text-muted-foreground'>
              {unreadCount > 0
                ? `${unreadCount} unread — live from Incidents, Workbench, and system health`
                : 'Live from Incidents, Workbench, and system health'}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant='link'
              size='sm'
              onClick={markAllAsRead}
              className='h-auto shrink-0 p-0 text-xs text-brand-cornflower'
            >
              Mark all read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <div className='max-h-[480px] overflow-y-auto p-3'>
          {notifications.length === 0 ? (
            <div className='py-10 text-center'>
              <div className='mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10'>
                <Icons.checkCircle className='h-6 w-6 text-emerald-500' />
              </div>
              <p className='text-sm font-medium text-foreground'>All caught up!</p>
              <p className='mt-1 text-xs text-muted-foreground'>
                No open incidents, workbench items, or system issues
              </p>
            </div>
          ) : (
            <div className='space-y-2'>
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  read={readIds.has(notification.id)}
                  onOpen={markAsRead}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
