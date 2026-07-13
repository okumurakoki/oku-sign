import Link from 'next/link'

const NAVY = '#3d4f5f'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: NAVY }}>
              <span className="text-xs font-bold text-white">oku</span>
            </div>
            <span className="text-base font-semibold tracking-tight">okuサイン</span>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/login" className="text-gray-600 hover:text-gray-900">ログイン</Link>
            <Link
              href="/signup"
              className="rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: NAVY }}
            >
              無料で始める
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-16 text-center">
        <p className="mb-4 text-sm font-medium tracking-wide" style={{ color: NAVY }}>
          okuパートナープログラム特典
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          契約を、その場で締結する。<br />シンプルな電子契約サービス
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">
          PDFをアップロードし、署名欄を置いて送るだけ。相手はメールのリンクから、その場で署名。
          締結済みのPDFは監査証跡つきで自動保存されます。
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: NAVY }}
          >
            無料で始める
          </Link>
          <Link href="/login" className="rounded-md border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            ログイン
          </Link>
        </div>
        <p className="mt-4 text-xs text-gray-400">月額2,980円・送信無制限・いつでも解約可能</p>
      </section>

      {/* Steps */}
      <section className="border-y border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-gray-400">3ステップで締結</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              { n: '01', t: 'PDFをアップロード', d: '契約書のPDFをアップロードし、署名欄・日付欄を配置します。テンプレート保存にも対応。' },
              { n: '02', t: '署名者に送信', d: '署名者ごとに順番を指定して送信。相手はメールのリンクから、その場で署名します。' },
              { n: '03', t: '締結・自動保存', d: '全員の署名が完了すると、署名証明ページつきのPDFを自動生成して保管します。' },
            ].map((s) => (
              <div key={s.n} className="rounded-xl border border-gray-100 bg-white p-6">
                <div className="text-2xl font-bold" style={{ color: NAVY }}>{s.n}</div>
                <h3 className="mt-3 text-base font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-8 sm:grid-cols-2">
          {[
            { t: '署名欄の自由配置', d: 'PDF上の好きな位置に、署名者ごとに署名・テキスト・日付・印鑑の欄を配置できます。' },
            { t: '順序つき署名', d: '「甲が署名したら乙へ」といった順番を指定。前の署名者が終わると次へ自動で通知します。' },
            { t: '改ざん検知と監査証跡', d: '原本のハッシュ値・署名日時・IPアドレスを記録した証明ページをPDFに付与します。' },
            { t: 'アクセスコード保護', d: '重要な書類には署名時のアクセスコードを設定し、なりすましを防ぎます。' },
          ].map((f) => (
            <div key={f.t} className="border-l-2 pl-5" style={{ borderColor: NAVY }}>
              <h3 className="text-base font-semibold">{f.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-gray-100 bg-gray-50/60">
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">料金</h2>
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-8">
            <p className="text-base font-semibold">パートナープラン</p>
            <p className="mt-3 text-4xl font-bold">
              ¥2,980<span className="text-base font-normal text-gray-500"> / 月</span>
            </p>
            <ul className="mt-6 space-y-2 text-left text-sm text-gray-600">
              <li>・ 電子契約の送信 無制限</li>
              <li>・ 署名欄の自由配置・テンプレート</li>
              <li>・ 監査証跡つき署名済みPDF</li>
              <li>・ いつでも解約可能</li>
            </ul>
            <Link
              href="/signup"
              className="mt-8 block rounded-md px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: NAVY }}
            >
              無料で始める
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} oku株式会社</p>
          <nav className="flex items-center gap-4 text-xs text-gray-500">
            <Link href="/terms" className="hover:text-gray-900">利用規約</Link>
            <Link href="/privacy" className="hover:text-gray-900">プライバシーポリシー</Link>
            <Link href="/legal" className="hover:text-gray-900">特定商取引法に基づく表記</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
