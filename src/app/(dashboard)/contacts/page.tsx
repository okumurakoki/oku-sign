'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function ContactsPage() {
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formCompany, setFormCompany] = useState('')
  const [formDept, setFormDept] = useState('')
  const [formMemo, setFormMemo] = useState('')

  const utils = trpc.useUtils()
  const contactList = trpc.contacts.list.useQuery({
    search: search || undefined,
    page,
    perPage: 30,
  })

  const createContact = trpc.contacts.create.useMutation({
    onSuccess: () => {
      utils.contacts.list.invalidate()
      resetForm()
      setShowCreate(false)
    },
  })

  const updateContact = trpc.contacts.update.useMutation({
    onSuccess: () => {
      utils.contacts.list.invalidate()
      resetForm()
      setShowEdit(null)
    },
  })

  const deleteContact = trpc.contacts.delete.useMutation({
    onSuccess: () => utils.contacts.list.invalidate(),
  })

  const bulkDelete = trpc.contacts.bulkDelete.useMutation({
    onSuccess: () => {
      setSelected(new Set())
      utils.contacts.list.invalidate()
      setShowDeleteDialog(false)
    },
  })

  const resetForm = () => {
    setFormName('')
    setFormEmail('')
    setFormCompany('')
    setFormDept('')
    setFormMemo('')
  }

  const openEdit = (contact: { id: string; name: string; email: string; companyName: string | null; department: string | null; memo: string | null }) => {
    setFormName(contact.name)
    setFormEmail(contact.email)
    setFormCompany(contact.companyName ?? '')
    setFormDept(contact.department ?? '')
    setFormMemo(contact.memo ?? '')
    setShowEdit(contact.id)
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const toggleAll = () => {
    if (!contactList.data) return
    if (selected.size === contactList.data.items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(contactList.data.items.map((c) => c.id)))
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">アドレス帳</h1>
        <Button size="sm" onClick={() => { resetForm(); setShowCreate(true) }}>
          連絡先を追加
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selected.size}件選択中</span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs text-destructive hover:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              一括削除
            </Button>
          </div>
        )}
        <form onSubmit={handleSearch} className="ml-auto flex items-center gap-2">
          <Input
            placeholder="連絡先を検索"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-8 w-[200px] text-[13px]"
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }}
              className="h-8 text-xs text-muted-foreground"
            >
              クリア
            </Button>
          )}
        </form>
      </div>

      {/* Table */}
      {contactList.isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : contactList.data?.items.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground mb-1">
            {search ? `「${search}」に一致する連絡先はありません` : '連絡先がまだありません'}
          </p>
          {!search && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => { resetForm(); setShowCreate(true) }}>
              最初の連絡先を追加
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#FAFBFC] hover:bg-[#FAFBFC]">
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === (contactList.data?.items.length ?? 0) && selected.size > 0}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-[var(--line-strong)] accent-[var(--primary)]"
                    />
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground">氏名</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground">メールアドレス</TableHead>
                  <TableHead className="text-[11px] font-semibold text-muted-foreground">会社名</TableHead>
                  <TableHead className="w-24 text-[11px] font-semibold text-muted-foreground">部署</TableHead>
                  <TableHead className="w-28 text-[11px] font-semibold text-muted-foreground">登録日</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contactList.data?.items.map((c) => (
                  <TableRow key={c.id} className="group h-12 hover:bg-[#FAFBFC]">
                    <TableCell className="py-0">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="h-3.5 w-3.5 rounded border-[var(--line-strong)] accent-[var(--primary)]"
                      />
                    </TableCell>
                    <TableCell className="py-0 text-[13px] font-medium">{c.name}</TableCell>
                    <TableCell className="py-0 text-[13px] text-muted-foreground">{c.email}</TableCell>
                    <TableCell className="py-0 text-[13px] text-muted-foreground">{c.companyName ?? <span className="text-[var(--faint)]">—</span>}</TableCell>
                    <TableCell className="py-0 text-[13px] text-muted-foreground">{c.department ?? <span className="text-[var(--faint)]">—</span>}</TableCell>
                    <TableCell className="tnum py-0 text-[12px] text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString('ja-JP')}
                    </TableCell>
                    <TableCell className="py-0">
                      <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() => openEdit(c)}
                        >
                          編集
                        </button>
                        <button
                          className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                          onClick={() => deleteContact.mutate({ id: c.id })}
                        >
                          削除
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {contactList.data && contactList.data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {contactList.data.total}件中 {(page - 1) * 30 + 1}-{Math.min(page * 30, contactList.data.total)}件
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>前へ</Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page >= contactList.data.totalPages} onClick={() => setPage(page + 1)}>次へ</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>連絡先を追加</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createContact.mutate({
                name: formName,
                email: formEmail,
                companyName: formCompany || undefined,
                department: formDept || undefined,
                memo: formMemo || undefined,
              })
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">氏名</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="山田 太郎" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">メールアドレス</Label>
                <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="taro@example.com" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">会社名（任意）</Label>
                <Input value={formCompany} onChange={(e) => setFormCompany(e.target.value)} placeholder="株式会社サンプル" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">部署（任意）</Label>
                <Input value={formDept} onChange={(e) => setFormDept(e.target.value)} placeholder="営業部" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">メモ（任意）</Label>
              <textarea
                value={formMemo}
                onChange={(e) => setFormMemo(e.target.value)}
                placeholder="備考"
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>キャンセル</Button>
              <Button type="submit" disabled={!formName || !formEmail || createContact.isPending}>
                {createContact.isPending ? '追加中...' : '追加'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!showEdit} onOpenChange={() => setShowEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>連絡先を編集</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!showEdit) return
              updateContact.mutate({
                id: showEdit,
                name: formName || undefined,
                email: formEmail || undefined,
                companyName: formCompany,
                department: formDept,
                memo: formMemo,
              })
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">氏名</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">メールアドレス</Label>
                <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">会社名</Label>
                <Input value={formCompany} onChange={(e) => setFormCompany(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">部署</Label>
                <Input value={formDept} onChange={(e) => setFormDept(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">メモ</Label>
              <textarea
                value={formMemo}
                onChange={(e) => setFormMemo(e.target.value)}
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowEdit(null)}>キャンセル</Button>
              <Button type="submit" disabled={updateContact.isPending}>
                {updateContact.isPending ? '保存中...' : '保存'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selected.size}件の連絡先を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>この操作は取り消せません。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDelete.mutate({ ids: Array.from(selected) })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDelete.isPending ? '削除中...' : '削除する'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
