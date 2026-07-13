import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/server/auth'
import { getDb } from '@/server/db'
import { contracts, templates } from '@/server/db/schema'
import { and, eq } from 'drizzle-orm'
import { uploadPdfToPath } from '@/server/storage'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const kind = (formData.get('kind') as string | null) ?? 'contract'
  const targetId = (formData.get('targetId') ?? formData.get('contractId')) as string | null

  if (!file || !targetId) {
    return NextResponse.json({ error: 'Missing file or targetId' }, { status: 400 })
  }

  // アップロード先リソースの所有者のみ許可
  const db = getDb()
  let storagePath: string
  if (kind === 'template') {
    const [tpl] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(eq(templates.id, targetId), eq(templates.createdBy, user.id)))
      .limit(1)
    if (!tpl) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    storagePath = `templates/${targetId}/original.pdf`
  } else {
    const [contract] = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(and(eq(contracts.id, targetId), eq(contracts.createdBy, user.id)))
      .limit(1)
    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }
    storagePath = `contracts/${targetId}/original.pdf`
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const path = await uploadPdfToPath(buffer, storagePath)

  // pdfUrl はサーバー派生パスでのみ設定（クライアントに任意パスを持たせない=IDOR防止）
  const pdfName = file.name.slice(0, 255)
  if (kind === 'template') {
    await db.update(templates)
      .set({ pdfUrl: path, pdfName, pdfSize: file.size, updatedAt: new Date() })
      .where(and(eq(templates.id, targetId), eq(templates.createdBy, user.id)))
  } else {
    await db.update(contracts)
      .set({ pdfUrl: path, pdfName, pdfSize: file.size, updatedAt: new Date() })
      .where(and(eq(contracts.id, targetId), eq(contracts.createdBy, user.id)))
  }

  return NextResponse.json({ ok: true, name: pdfName, size: file.size })
}
