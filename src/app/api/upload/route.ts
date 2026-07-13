import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/server/auth'
import { uploadPdf } from '@/server/storage'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const contractId = formData.get('contractId') as string | null

  if (!file || !contractId) {
    return NextResponse.json({ error: 'Missing file or contractId' }, { status: 400 })
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const url = await uploadPdf(buffer, file.name, contractId)

  return NextResponse.json({
    url,
    name: file.name,
    size: file.size,
  })
}
