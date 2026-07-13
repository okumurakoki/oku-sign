import { createClient } from '@supabase/supabase-js'

const BUCKET = 'documents'

function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase Storage の環境変数が未設定です')
  }
  return createClient(url, key)
}

// 指定パスにPDFをアップロードし、ストレージのパス（公開URLではない）を返す。
// 表示名は別途 pdfName カラムに保持するため、キーは固定名にして日本語名によるキー破損を防ぐ。
export async function uploadPdfToPath(file: Buffer, path: string) {
  const supabase = getStorageClient()

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: true })

  if (error) throw new Error(`Upload failed: ${error.message}`)
  return path
}

// 署名済みPDFをアップロードし、パスを返す。
export async function uploadSignedPdf(file: Buffer, contractId: string) {
  const supabase = getStorageClient()
  const path = `contracts/${contractId}/signed.pdf`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: true })

  if (error) throw new Error(`Signed upload failed: ${error.message}`)
  return path
}

// ストレージ上のPDFをダウンロードして Buffer で返す（署名合成に使用）。
export async function downloadPdf(path: string): Promise<Buffer> {
  const supabase = getStorageClient()
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error(`Download failed: ${error?.message ?? 'no data'}`)
  return Buffer.from(await data.arrayBuffer())
}

// 有効期限付きの署名URLを生成（既定1時間）。
export async function getSignedUrl(path: string, expiresIn = 3600) {
  const supabase = getStorageClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error || !data) throw new Error(`Signed URL failed: ${error?.message ?? 'no data'}`)
  return data.signedUrl
}
