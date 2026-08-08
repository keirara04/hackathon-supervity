'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Icons } from '@/components/ui/icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { useSearchFilter } from '@/hooks'

interface DirectoryUser {
  account_id: string
  display_name: string
  email_address: string | null
  department: string | null
  x_vip: boolean
  location: string | null
}

interface UserForm {
  display_name: string
  email_address: string
  department: string
  x_vip: boolean
  location: string
}

const EMPTY_FORM: UserForm = { display_name: '', email_address: '', department: '', x_vip: false, location: '' }

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }

function toForm(u: DirectoryUser): UserForm {
  return {
    display_name: u.display_name,
    email_address: u.email_address ?? '',
    department: u.department ?? '',
    x_vip: u.x_vip,
    location: u.location ?? '',
  }
}

export default function UsersDirectoryPage() {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [detailUser, setDetailUser] = useState<DirectoryUser | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<UserForm>(EMPTY_FORM)

  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<UserForm>(EMPTY_FORM)

  const { query, setQuery, filtered: visibleUsers } = useSearchFilter(
    users,
    (u) => `${u.display_name} ${u.email_address ?? ''} ${u.department ?? ''} ${u.location ?? ''}`
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get<{ users: DirectoryUser[]; count: number }>('/api/users-directory')
      setUsers(res.users)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users directory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openDetail(u: DirectoryUser) {
    setDetailUser(u)
    setEditing(false)
    setEditForm(toForm(u))
  }

  async function saveEdit() {
    if (!detailUser) return
    setSaving(true)
    setError(null)
    try {
      await apiClient.patch(`/api/users-directory/${detailUser.account_id}`, editForm)
      setDetailUser(null)
      setEditing(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  async function deleteUser() {
    if (!detailUser) return
    if (!confirm(`Delete ${detailUser.display_name} from the directory?`)) return
    setSaving(true)
    setError(null)
    try {
      await apiClient.delete(`/api/users-directory/${detailUser.account_id}`)
      setDetailUser(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete user')
    } finally {
      setSaving(false)
    }
  }

  async function createUser() {
    if (!createForm.display_name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await apiClient.post('/api/users-directory', createForm)
      setCreating(false)
      setCreateForm(EMPTY_FORM)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div className='space-y-8' variants={containerVariants} initial='hidden' animate='visible'>
      <motion.div variants={itemVariants} className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-display-3 font-bold tracking-tight text-brand-navy'>Users Directory</h1>
          <p className='mt-2 text-lg text-muted-foreground'>
            {users.length} identities the Triage operator resolves tickets against.
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='gradient' size='sm' onClick={() => setCreating(true)}>
            <Icons.plus className='h-4 w-4 sm:mr-2' />
            <span className='hidden sm:inline'>Add User</span>
          </Button>
          <Button variant='outline' size='sm' onClick={load} disabled={loading}>
            <Icons.refresh className={cn('sm:mr-2 h-4 w-4', loading && 'animate-spin')} />
            <span className='hidden sm:inline'>Refresh</span>
          </Button>
        </div>
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

      <motion.div variants={itemVariants} className='relative'>
        <Icons.search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search name, email, department, location...'
          className='w-full rounded-full border border-border bg-muted/10 py-2 pl-9 pr-4 text-sm outline-none focus:border-primary/50 sm:max-w-sm'
        />
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Directory</CardTitle>
            <CardDescription>Click a user to view, edit, or delete.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto'>
              <table className='w-full text-sm'>
                <thead>
                  <tr className='border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground'>
                    <th className='pb-2 pr-4'>Name</th>
                    <th className='pb-2 pr-4'>Email</th>
                    <th className='pb-2 pr-4'>Department</th>
                    <th className='pb-2'>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((u) => (
                    <tr
                      key={u.account_id}
                      onClick={() => openDetail(u)}
                      className='cursor-pointer border-b border-border/50 hover:bg-muted/10'
                    >
                      <td className='py-2 pr-4 font-medium'>
                        {u.display_name}
                        {u.x_vip && (
                          <span className='ml-2 rounded-full bg-brand-purple/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-purple'>
                            VIP
                          </span>
                        )}
                      </td>
                      <td className='py-2 pr-4 text-muted-foreground'>{u.email_address ?? '—'}</td>
                      <td className='py-2 pr-4 text-muted-foreground'>{u.department ?? '—'}</td>
                      <td className='py-2 text-muted-foreground'>{u.location ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleUsers.length === 0 && !loading && (
                <p className='py-8 text-center text-sm text-muted-foreground'>No users match this search.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Detail / Edit dialog */}
      <Dialog open={detailUser !== null} onOpenChange={(open) => !open && setDetailUser(null)}>
        <DialogContent>
          {detailUser && (
            <>
              <DialogHeader>
                <DialogTitle>{editing ? 'Edit User' : detailUser.display_name}</DialogTitle>
                <DialogDescription>{detailUser.account_id}</DialogDescription>
              </DialogHeader>

              {editing ? (
                <div className='space-y-3'>
                  <input
                    value={editForm.display_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                    placeholder='Name'
                    className='w-full rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm outline-none focus:border-primary/50'
                  />
                  <input
                    value={editForm.email_address}
                    onChange={(e) => setEditForm((f) => ({ ...f, email_address: e.target.value }))}
                    placeholder='Email'
                    className='w-full rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm outline-none focus:border-primary/50'
                  />
                  <input
                    value={editForm.department}
                    onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                    placeholder='Department'
                    className='w-full rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm outline-none focus:border-primary/50'
                  />
                  <input
                    value={editForm.location}
                    onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder='Location'
                    className='w-full rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm outline-none focus:border-primary/50'
                  />
                  <div className='flex items-center gap-2'>
                    <Switch checked={editForm.x_vip} onCheckedChange={(v) => setEditForm((f) => ({ ...f, x_vip: v }))} />
                    <span className='text-sm text-muted-foreground'>VIP</span>
                  </div>
                  <div className='flex gap-2 pt-2'>
                    <Button variant='gradient' size='sm' onClick={saveEdit} disabled={saving}>
                      {saving ? <Icons.loader className='mr-2 h-4 w-4 animate-spin' /> : <Icons.check className='mr-2 h-4 w-4' />}
                      Save
                    </Button>
                    <Button variant='outline' size='sm' onClick={() => setEditing(false)} disabled={saving}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className='space-y-3'>
                  <div className='grid grid-cols-2 gap-3 text-xs text-muted-foreground'>
                    <p><span className='font-semibold text-foreground'>Email:</span> {detailUser.email_address ?? '—'}</p>
                    <p><span className='font-semibold text-foreground'>Department:</span> {detailUser.department ?? '—'}</p>
                    <p><span className='font-semibold text-foreground'>Location:</span> {detailUser.location ?? '—'}</p>
                    <p><span className='font-semibold text-foreground'>VIP:</span> {detailUser.x_vip ? 'Yes' : 'No'}</p>
                  </div>
                  <div className='flex gap-2 pt-2'>
                    <Button variant='outline' size='sm' onClick={() => setEditing(true)}>
                      <Icons.pencil className='mr-2 h-4 w-4' />
                      Edit
                    </Button>
                    <Button variant='destructive' size='sm' onClick={deleteUser} disabled={saving}>
                      <Icons.trash className='mr-2 h-4 w-4' />
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={(open) => !open && setCreating(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>New identity for Triage to resolve tickets against.</DialogDescription>
          </DialogHeader>
          <div className='space-y-3'>
            <input
              value={createForm.display_name}
              onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))}
              placeholder='Name (required)'
              className='w-full rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm outline-none focus:border-primary/50'
            />
            <input
              value={createForm.email_address}
              onChange={(e) => setCreateForm((f) => ({ ...f, email_address: e.target.value }))}
              placeholder='Email'
              className='w-full rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm outline-none focus:border-primary/50'
            />
            <input
              value={createForm.department}
              onChange={(e) => setCreateForm((f) => ({ ...f, department: e.target.value }))}
              placeholder='Department'
              className='w-full rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm outline-none focus:border-primary/50'
            />
            <input
              value={createForm.location}
              onChange={(e) => setCreateForm((f) => ({ ...f, location: e.target.value }))}
              placeholder='Location'
              className='w-full rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm outline-none focus:border-primary/50'
            />
            <div className='flex items-center gap-2'>
              <Switch checked={createForm.x_vip} onCheckedChange={(v) => setCreateForm((f) => ({ ...f, x_vip: v }))} />
              <span className='text-sm text-muted-foreground'>VIP</span>
            </div>
            <div className='flex gap-2 pt-2'>
              <Button variant='gradient' size='sm' onClick={createUser} disabled={saving || !createForm.display_name.trim()}>
                {saving ? <Icons.loader className='mr-2 h-4 w-4 animate-spin' /> : <Icons.plus className='mr-2 h-4 w-4' />}
                Create
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
