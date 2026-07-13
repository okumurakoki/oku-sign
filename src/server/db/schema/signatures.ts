import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'
import { contracts } from './contracts'
import { contractSigners } from './contract-signers'
import { signatureFields } from './signature-fields'

// 署名欄1つにつき1レコード。fieldId=null は旧来の欄なし署名（後方互換）。
export const signatures = pgTable('signatures', {
  id: text('id').primaryKey(), // ULID
  contractId: text('contract_id').notNull().references(() => contracts.id),
  signerId: text('signer_id').notNull().references(() => contractSigners.id),
  fieldId: text('field_id').references(() => signatureFields.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['draw', 'text', 'date', 'stamp'] }).notNull().default('draw'),
  // draw/stamp: 画像(dataURL or Storageパス)、text/date: 文字値
  imageUrl: text('image_url'),
  value: text('value'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  signedAt: timestamp('signed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('signatures_signer_idx').on(t.signerId),
  index('signatures_field_idx').on(t.fieldId),
])
