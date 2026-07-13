import { pgTable, text, integer, real, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { contracts } from './contracts'
import { contractSigners } from './contract-signers'

// 署名欄の座標配置。x/y/width/height はページに対する割合(0-100%)で保持し、
// 描画解像度に依存せず署名済みPDF合成時に pt へ変換する。
export const signatureFields = pgTable('signature_fields', {
  id: text('id').primaryKey(), // ULID
  contractId: text('contract_id').notNull().references(() => contracts.id, { onDelete: 'cascade' }),
  signerId: text('signer_id').references(() => contractSigners.id, { onDelete: 'cascade' }),
  fieldType: text('field_type', {
    enum: ['signature', 'text', 'date', 'stamp'],
  }).notNull().default('signature'),
  label: text('label'),
  page: integer('page').notNull().default(1),
  x: real('x').notNull(),        // 左上X（%）
  y: real('y').notNull(),        // 左上Y（%）
  width: real('width').notNull(),  // 幅（%）
  height: real('height').notNull(), // 高さ（%）
  required: boolean('required').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('signature_fields_contract_idx').on(t.contractId),
  index('signature_fields_signer_idx').on(t.signerId),
])
