import Link from 'next/link'

const NAVY = '#2680EB'

// 法務ページ共通の枠（LPと同じヘッダー・フッター）
export function LegalShell({ title, updatedAt, children }: { title: string; updatedAt?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b border-gray-100">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: NAVY }}>
              <span className="text-xs font-bold text-white">oku</span>
            </div>
            <span className="text-base font-semibold tracking-tight">okuサイン</span>
          </Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">ホームへ</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {updatedAt && <p className="mt-2 text-xs text-gray-400">最終更新日: {updatedAt}</p>}
        <div className="legal-body mt-8 space-y-6 text-sm leading-relaxed text-gray-700">
          {children}
        </div>
      </main>

      <footer className="border-t border-gray-100">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
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

export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900">{heading}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  )
}
