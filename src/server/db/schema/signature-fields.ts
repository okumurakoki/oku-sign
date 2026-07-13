import { pgTable, text, integer, real, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { contracts } from './contracts'
import { contractSigners } from './contract-signers'
import { templates } from './templates'

// 署名欄の座標配置。x/y/width/height はページに対する割合(0-100%)で保持し、
// 描画解像度に依存せず署名済みPDF合成時に pt へ変換する。
// 契約に属する欄(contractId+signerId) と テンプレに属する欄(templateId+signerOrderスロット) を兼ねる。
export const signatureFields = pgTable('signature_fields', {
  id: text('id').primaryKey(), // ULID
  contractId: text('contract_id').references(() => contracts.id, { onDelete: 'cascade' }),
  templateId: text('template_id').references(() => templates.id, { onDelete: 'cascade' }),
  signerId: text('signer_id').references(() => contractSigners.id, { onDelete: 'cascade' }),
  signerOrder: integer('signer_order').notNull().default(1), // 署名者スロット（テンプレ用・契約でも保持）
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
  index('signature_fields_template_idx').on(t.templateId),
  index('signature_fields_signer_idx').on(t.signerId),
])
