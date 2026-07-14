// 契約・署名者のステータス表示を全画面で統一する（freee Vibes型: 薄地+濃文字のフラットバッジ）。
// 色はステータスの意味で固定: 進行=青 / 待ち=琥珀 / 完了=緑 / 中立=スレート / 異常=赤。
// 進捗バーにも同じ意味色を使い、「ぱっと見で異常が分かる」一覧にする。

export type ContractStatus = 'draft' | 'sent' | 'signing' | 'completed' | 'cancelled' | 'expired'
export type SignerStatus = 'pending' | 'notified' | 'viewed' | 'signed' | 'declined'

type Tone = 'ok' | 'wait' | 'alert' | 'slate' | 'blue'

const toneClass: Record<Tone, string> = {
  ok: 'text-[var(--ok)] bg-[var(--ok-bg)]',
  wait: 'text-[var(--wait)] bg-[var(--wait-bg)]',
  alert: 'text-[var(--alert)] bg-[var(--alert-bg)]',
  slate: 'text-[var(--slate)] bg-[var(--slate-bg)]',
  blue: 'text-[var(--brand-ink)] bg-[var(--accent)]',
}

export const contractStatusConfig: Record<ContractStatus, { label: string; tone: Tone }> = {
  draft: { label: '下書き', tone: 'slate' },
  sent: { label: '確認待ち', tone: 'wait' },
  signing: { label: '署名中', tone: 'blue' },
  completed: { label: '締結済み', tone: 'ok' },
  cancelled: { label: '取消', tone: 'slate' },
  expired: { label: '期限切れ', tone: 'alert' },
}

export const signerStatusConfig: Record<SignerStatus, { label: string; tone: Tone }> = {
  pending: { label: '待機中', tone: 'slate' },
  notified: { label: '通知済み', tone: 'wait' },
  viewed: { label: '閲覧済み', tone: 'blue' },
  signed: { label: '署名済み', tone: 'ok' },
  declined: { label: '辞退', tone: 'alert' },
}

export function StatusBadge({
  status,
  kind = 'contract',
  className = '',
}: {
  status: string
  kind?: 'contract' | 'signer'
  className?: string
}) {
  const cfg =
    kind === 'contract'
      ? contractStatusConfig[status as ContractStatus]
      : signerStatusConfig[status as SignerStatus]
  if (!cfg) return null
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-[5px] px-2 py-0.5 text-[11px] font-semibold ${toneClass[cfg.tone]} ${className}`}
    >
      {cfg.label}
    </span>
  )
}

// 一覧の署名進捗バー。異常(辞退あり/期限切れ/取消)は赤、それ以外は緑。
export function SignProgress({
  signed,
  total,
  danger = false,
}: {
  signed: number
  total: number
  danger?: boolean
}) {
  if (total <= 0) return <span className="text-xs text-[var(--faint)]">—</span>
  const pct = Math.round((signed / total) * 100)
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-[5px] w-[52px] overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, background: danger ? 'var(--alert)' : 'var(--ok)' }}
        />
      </span>
      <span className="tnum w-[30px] text-[11.5px] text-muted-foreground">
        {signed}/{total}
      </span>
    </span>
  )
}
