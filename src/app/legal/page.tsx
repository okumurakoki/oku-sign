import { LegalShell } from '@/components/legal-shell'

export const metadata = { title: '特定商取引法に基づく表記 | okuサイン' }

// ※ TODO(奥村): 【要記入】箇所を実際の会社情報に置き換えてください。
const rows: { label: string; value: string; todo?: boolean }[] = [
  { label: '販売事業者', value: 'oku株式会社' },
  { label: '運営統括責任者', value: '【要記入】代表者氏名', todo: true },
  { label: '所在地', value: '【要記入】本店所在地', todo: true },
  { label: '電話番号', value: '【要記入】（受付時間: 平日10:00〜18:00）', todo: true },
  { label: 'メールアドレス', value: 'support@oku-ai.co.jp' },
  { label: '販売URL', value: 'https://sign.oku-ai.co.jp' },
  { label: '販売価格', value: 'パートナープラン 月額2,980円（税込）' },
  { label: '商品代金以外の必要料金', value: 'インターネット接続に係る通信料等はお客様のご負担となります。' },
  { label: '支払方法', value: 'クレジットカード（決済代行: Stripe, Inc.）' },
  { label: '支払時期', value: 'お申し込み時に初回請求、以降は毎月自動更新で請求します。' },
  { label: 'サービス提供時期', value: 'お支払い手続きの完了後、直ちにご利用いただけます。' },
  { label: '解約・返金について', value: 'マイページからいつでも解約できます。解約は当該請求期間の末日をもって効力を生じ、日割返金は行いません。サービスの性質上、原則として返品・返金には応じられません。' },
]

export default function LegalPage() {
  return (
    <LegalShell title="特定商取引法に基づく表記">
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} className={i % 2 === 0 ? 'bg-gray-50/60' : 'bg-white'}>
                <th className="w-40 border-b border-gray-100 px-4 py-3 text-left align-top font-medium text-gray-600">
                  {r.label}
                </th>
                <td className={`border-b border-gray-100 px-4 py-3 align-top ${r.todo ? 'text-amber-700' : 'text-gray-800'}`}>
                  {r.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pt-2 text-xs text-gray-400">
        ※【要記入】の項目は公開前に実際の情報へ差し替えてください。
      </p>
    </LegalShell>
  )
}
