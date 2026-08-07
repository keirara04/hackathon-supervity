'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Icons } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'

interface KBArticle {
  article_id: string
  title: string
  root_cause: string
  workaround: string
  category: string
  x_auto_safe: boolean
  action_type: string
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

const ACTION_STYLES: Record<string, string> = {
  grant_access: 'bg-brand-cornflower/15 text-brand-cornflower',
  send_steps: 'bg-emerald-500/15 text-emerald-500',
  escalate: 'bg-amber-500/15 text-amber-500',
}

export default function KnowledgeBasePage() {
  const [articles, setArticles] = useState<KBArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [pending, setPending] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<{ articles: KBArticle[]; count: number }>('/api/kb-articles')
      setArticles(res.articles)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load knowledge base')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function toggleSafe(articleId: string, next: boolean) {
    setPending((prev) => new Set(prev).add(articleId))
    try {
      await apiClient.patch(`/api/kb-articles/${articleId}`, { x_auto_safe: next })
      setArticles((prev) => prev.map((a) => (a.article_id === articleId ? { ...a, x_auto_safe: next } : a)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update article')
    } finally {
      setPending((prev) => {
        const n = new Set(prev)
        n.delete(articleId)
        return n
      })
    }
  }

  const categories = ['all', ...Array.from(new Set(articles.map((a) => a.category)))]
  const filtered = categoryFilter === 'all' ? articles : articles.filter((a) => a.category === categoryFilter)

  return (
    <motion.div className='space-y-8' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>Knowledge Base</h1>
          <p className='mt-2 text-lg text-muted-foreground'>
            {articles.length} articles the Diagnose operator matches tickets against. Toggle auto-safe to unlock auto-resolution.
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

      <motion.div variants={itemVariants} className='flex flex-wrap gap-2'>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors',
              categoryFilter === cat
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border bg-muted/10 text-muted-foreground hover:bg-muted/20'
            )}
          >
            {cat}
          </button>
        ))}
      </motion.div>

      <div className='grid gap-4 md:grid-cols-2'>
        {filtered.map((article) => (
          <motion.div key={article.article_id} variants={itemVariants}>
            <Card className='h-full'>
              <CardHeader>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <CardTitle className='text-base'>{article.title}</CardTitle>
                    <CardDescription>
                      {article.article_id} ·{' '}
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
                          ACTION_STYLES[article.action_type] ?? 'bg-muted text-muted-foreground'
                        )}
                      >
                        {article.action_type}
                      </span>
                    </CardDescription>
                  </div>
                  <div className='flex shrink-0 items-center gap-2'>
                    <span className='text-xs text-muted-foreground'>Auto-safe</span>
                    <Switch
                      checked={article.x_auto_safe}
                      disabled={pending.has(article.article_id)}
                      onCheckedChange={(v) => toggleSafe(article.article_id, v)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                <p>
                  <span className='font-semibold'>Root cause: </span>
                  {article.root_cause}
                </p>
                <p>
                  <span className='font-semibold'>Workaround: </span>
                  {article.workaround}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {!loading && filtered.length === 0 && (
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className='py-16 text-center text-sm text-muted-foreground'>No articles match this filter.</CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  )
}
