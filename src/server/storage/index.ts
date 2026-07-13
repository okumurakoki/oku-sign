import { createClient } from '@supabase/supabase-js'

function getStorageClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function uploadPdf(file: Buffer, fileName: string, contractId: string) {
  const supabase = getStorageClient()
  const path = `contracts/${contractId}/${fileName}`

  const { data, error } = await supabase.storage
    .from('documents')
    .upload(path, file, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  const { data: urlData } = supabase.storage
    .from('documents')
    .getPublicUrl(path)

  return urlData.publicUrl
}

export async function getSignedUrl(path: string) {
  const supabase = getStorageClient()
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, 3600)

  if (error) throw new Error(`Signed URL failed: ${error.message}`)
  return data.signedUrl
}
