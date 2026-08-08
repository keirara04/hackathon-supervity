'use client'

import { useMemo, useState } from 'react'

/**
 * Generic client-side search filter — case-insensitive substring match
 * against a caller-supplied searchable string per item. Used across the
 * Pipeline pages (Zendesk Tickets, Triage Queue, Run Log, Knowledge Base,
 * Incidents, Team Roster) so each just supplies which fields to search.
 */
export function useSearchFilter<T>(items: T[], searchableText: (item: T) => string) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => searchableText(item).toLowerCase().includes(q))
  }, [items, query, searchableText])

  return { query, setQuery, filtered }
}
