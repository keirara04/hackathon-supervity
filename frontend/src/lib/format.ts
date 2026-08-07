/**
 * Shared time formatting — one source of truth so timestamps render
 * identically across pages (Dashboard's live badge, Workbench's History
 * tab, etc) instead of each page inventing its own format.
 */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
