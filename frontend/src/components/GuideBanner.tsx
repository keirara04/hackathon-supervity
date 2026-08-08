'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Icons } from '@/components/ui/icons'

const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

/**
 * Dismissible banner for guide text arriving via ?guide= from an AI Insights
 * "Apply Suggestion" link — carries the exact backend-authored wording so
 * there's no separate copy of it to keep in sync per destination page.
 */
export function GuideBanner({ guide }: { guide: string | null }) {
  const [dismissed, setDismissed] = useState(false)
  if (!guide || dismissed) return null

  return (
    <motion.div variants={itemVariants} initial='hidden' animate='visible'>
      <Card className='border-brand-cornflower/40 bg-brand-cornflower/5'>
        <CardContent className='flex items-start justify-between gap-3 py-4'>
          <div className='flex items-start gap-2 text-sm'>
            <Icons.lightbulb className='mt-0.5 h-4 w-4 shrink-0 text-brand-cornflower' />
            <span>{guide}</span>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className='shrink-0 text-muted-foreground hover:text-foreground'
          >
            <Icons.close className='h-4 w-4' />
          </button>
        </CardContent>
      </Card>
    </motion.div>
  )
}
