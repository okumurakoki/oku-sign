import Link from 'next/link'

// LP: 白基調・製品画面が主役（クラウドサイン/マネフォ系）。
// 構成 = ヒーロー(製品ショット) → 信頼バー → zigzag機能(実UIを見せる) → 3ステップ → 料金 → CTA。

function Check({ className = 'h-[17px] w-[17px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function MiniBadge({ label, tone }: { label: string; tone: 'blue' | 'ok' | 'wait' }) {
  const map = {
    blue: 'text-[#1B5FC4] bg-[#EDF3FE]',
    ok: 'text-[#12805C] bg-[#E3F3EC]',
    wait: 'text-[#B4690E] bg-[#FBF0DE]',
  }
  return <span className={`rounded-[5px] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${map[tone]}`}>{label}</span>
}

// ヒーロー内の製品ショット（ダッシュボードのミニチュア再現）
function ProductShot() {
  const rows: { title: string; file: string; pct: number; badge: { label: string; tone: 'blue' | 'ok' | 'wait' }; date: string }[] = [
    { title: '業務委託契約書', file: 'gyoumu_itaku.pdf', pct: 50, badge: { label: '署名中', tone: 'blue' }, date: '7/14 09:41' },
    { title: '秘密保持契約書（NDA）', file: 'nda_2026.pdf', pct: 100, badge: { label: '締結済み', tone: 'ok' }, date: '7/13 18:02' },
    { title: '売買基本契約書', file: 'baibai_kihon.pdf', pct: 0, badge: { label: '確認待ち', tone: 'wait' }, date: '7/13 11:20' },
    { title: '賃貸借契約書', file: 'chintai.pdf', pct: 100, badge: { label: '締結済み', tone: 'ok' }, date: '7/12 10:15' },
  ]
  return (
    <div className="mx-auto mt-14 max-w-[960px]">
      <div className="overflow-hidden rounded-t-[14px] border border-[#E6EBF1] bg-white shadow-[0_2px_6px_rgba(20,30,50,.05),0_30px_70px_-28px_rgba(38,90,180,.28)]">
        {/* chrome */}
        <div className="flex h-10 items-center gap-[7px] border-b border-[#E6EBF1] bg-[#FBFCFE] px-4">
          <i className="h-[11px] w-[11px] rounded-full bg-[#E1E6EE]" />
          <i className="h-[11px] w-[11px] rounded-full bg-[#E1E6EE]" />
          <i className="h-[11px] w-[11px] rounded-full bg-[#E1E6EE]" />
          <span className="ml-3 font-mono text-[11px] text-[#8B95A5]">sign.oku-ai.co.jp</span>
        </div>
        {/* dashboard */}
        <div className="flex h-[420px] bg-[#F7F8FA] text-left">
          {/* sidebar */}
          <div className="hidden w-[168px] shrink-0 border-r border-[#E6E8EC] bg-white p-2 sm:block">
            <div className="flex items-center gap-2 px-2 pb-3 pt-1 text-[12.5px] font-bold">
              <span className="grid h-5 w-5 place-items-center rounded-[5px] bg-[#2680EB] text-[9px] font-bold text-white">ok</span>
              okuサイン
            </div>
            <div className="mb-1.5 grid h-[30px] place-items-center rounded-md bg-[#2680EB] text-[11.5px] font-semibold text-white">＋ 新しく送信</div>
            {['ホーム', '書類', 'テンプレート', 'アドレス帳'].map((l, i) => (
              <div
                key={l}
                className={`flex h-[29px] items-center gap-2 rounded-md px-2.5 text-[12px] font-medium ${
                  i === 0 ? 'bg-[#EDF3FE] font-semibold text-[#1B5FC4]' : 'text-[#586074]'
                }`}
              >
                <span className="h-[13px] w-[13px] rounded-[3px] border-[1.6px] border-current opacity-50" />
                {l}
              </div>
            ))}
          </div>
          {/* main */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-[42px] items-center border-b border-[#E6E8EC] bg-white px-4 text-[13px] font-bold">
              ホーム
              <span className="ml-auto hidden w-[150px] items-center rounded-md border border-[#E6E8EC] px-2.5 text-[11px] font-normal leading-7 text-[#98A0AE] sm:flex">
                書類を検索
              </span>
            </div>
            <div className="p-4">
              {/* strip */}
              <div className="mb-3 flex overflow-hidden rounded-lg border border-[#E6E8EC] bg-white">
                {[
                  { l: '確認待ち', v: '2', hot: true },
                  { l: '署名中', v: '5' },
                  { l: '今月 締結', v: '14' },
                  { l: '今月 送信', v: '23' },
                  { l: '総数', v: '128' },
                ].map((s, i) => (
                  <div key={s.l} className={`flex-1 px-3.5 py-2.5 ${i > 0 ? 'border-l border-[#EFF1F4]' : ''} ${i > 2 ? 'hidden md:block' : ''}`}>
                    <p className="text-[10.5px] text-[#667085]">{s.l}</p>
                    <p className={`mt-0.5 text-[17px] font-bold tabular-nums leading-none ${s.hot ? 'text-[#B4690E]' : 'text-[#1A1D24]'}`}>{s.v}</p>
                  </div>
                ))}
              </div>
              {/* table */}
              <div className="overflow-hidden rounded-lg border border-[#E6E8EC] bg-white">
                <div className="flex h-9 items-center border-b border-[#E6E8EC] px-3.5 text-[12px] font-bold text-[#1A1D24]">最近の書類</div>
                {rows.map((r) => (
                  <div key={r.title} className="flex h-[42px] items-center gap-3 border-b border-[#EFF1F4] px-3.5 text-[12px] last:border-0">
                    <span className="min-w-0 flex-1 truncate font-medium text-[#1A1D24]">
                      {r.title} <span className="text-[11px] font-normal text-[#98A0AE]">{r.file}</span>
                    </span>
                    <span className="hidden h-1 w-[46px] overflow-hidden rounded-full bg-[#E9ECF0] sm:block">
                      <span className="block h-full rounded-full bg-[#12805C]" style={{ width: `${r.pct}%` }} />
                    </span>
                    <MiniBadge label={r.badge.label} tone={r.badge.tone} />
                    <span className="hidden text-[11px] tabular-nums text-[#667085] md:inline">{r.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHead({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="mb-12 text-center">
      <p className="text-[13px] font-bold tracking-wide text-[#2680EB]">{eyebrow}</p>
      <h2 className="mt-3 text-[clamp(26px,3.4vw,36px)] font-bold leading-[1.4] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
        {title}
      </h2>
      {lead && <p className="mx-auto mt-3.5 max-w-[520px] text-[15px] leading-[1.8] text-[#5A6575]">{lead}</p>}
    </div>
  )
}

function VisChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#E6EBF1] bg-white shadow-[0_2px_6px_rgba(20,30,50,.04),0_18px_44px_-24px_rgba(38,90,180,.2)]">
      <div className="flex h-[34px] items-center gap-1.5 border-b border-[#E6EBF1] bg-[#FBFCFE] px-3">
        <i className="h-[9px] w-[9px] rounded-full bg-[#E1E6EE]" />
        <i className="h-[9px] w-[9px] rounded-full bg-[#E1E6EE]" />
        <i className="h-[9px] w-[9px] rounded-full bg-[#E1E6EE]" />
      </div>
      {children}
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="bg-white text-[#141B2B] antialiased">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-[#E6EBF1] bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-[62px] max-w-[1080px] items-center gap-7 px-6">
          <Link href="/" className="flex items-center gap-2 text-base font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#2680EB] text-xs font-bold text-white">ok</span>
            okuサイン
          </Link>
          <div className="ml-3 hidden gap-6 md:flex">
            <a href="#features" className="text-sm font-medium text-[#5A6575] hover:text-[#141B2B]">機能</a>
            <a href="#how" className="text-sm font-medium text-[#5A6575] hover:text-[#141B2B]">使い方</a>
            <a href="#pricing" className="text-sm font-medium text-[#5A6575] hover:text-[#141B2B]">料金</a>
          </div>
          <div className="ml-auto flex items-center gap-3.5">
            <Link href="/login" className="text-sm font-medium text-[#5A6575] hover:text-[#141B2B]">ログイン</Link>
            <Link
              href="/signup"
              className="flex h-9 items-center rounded-lg bg-[#2680EB] px-4 text-[13.5px] font-semibold text-white shadow-[0_1px_2px_rgba(38,128,235,.3)] hover:bg-[#1B5FC4]"
            >
              無料で始める
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="bg-gradient-to-b from-[#F5F9FE] to-white pt-[72px] text-center">
        <div className="mx-auto max-w-[1080px] px-6">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#CFE1FB] bg-[#EAF2FD] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#1B5FC4]">
            立会人型 電子署名・改ざん検知つき
          </span>
          <h1 className="text-[clamp(32px,5vw,52px)] font-bold leading-[1.28] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
            契約書を、<span className="text-[#2680EB]">その場で締結。</span>
            <br />
            紙もハンコも、もういらない。
          </h1>
          <p className="mx-auto mt-5 max-w-[560px] text-[16.5px] leading-[1.8] text-[#5A6575]">
            PDFに署名欄を置いて送るだけ。相手はメールのリンクから、その場で署名。締結した書類は監査証跡つきで自動保管されます。
          </p>
          <div className="mt-7 flex justify-center gap-3">
            <Link
              href="/signup"
              className="flex h-[46px] items-center rounded-[10px] bg-[#2680EB] px-6 text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(38,128,235,.3)] hover:bg-[#1B5FC4]"
            >
              無料で始める
            </Link>
            <a
              href="#how"
              className="flex h-[46px] items-center rounded-[10px] border border-[#E6EBF1] bg-white px-6 text-[15px] font-semibold text-[#141B2B] hover:bg-[#F5F8FC]"
            >
              使い方を見る
            </a>
          </div>
          <p className="mt-4 text-[13px] text-[#8B95A5]">月額2,980円・送信無制限・いつでも解約可能</p>
          <ProductShot />
        </div>
      </header>

      {/* Trust bar */}
      <div className="border-y border-[#E6EBF1] bg-[#F5F8FC] py-6">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6">
          {[
            <span key="1"><b className="font-semibold text-[#141B2B]">立会人型</b> 電子署名</span>,
            <span key="2">改ざん検知 <b className="font-semibold text-[#141B2B]">SHA-256</b></span>,
            <span key="3">監査証跡を<b className="font-semibold text-[#141B2B]">全操作記録</b></span>,
            <span key="4"><b className="font-semibold text-[#141B2B]">10年</b>保管</span>,
          ].map((node, i) => (
            <span key={i} className="flex items-center gap-2 text-[13.5px] font-medium text-[#5A6575]">
              <span className="text-[#12805C]"><Check className="h-4 w-4" /></span>
              {node}
            </span>
          ))}
        </div>
      </div>

      {/* Features: zigzag */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-[1080px] px-6">
          <SectionHead
            eyebrow="FEATURES"
            title="契約に必要なものを、ひとつに。"
            lead="署名欄の配置から順序つき署名、監査証跡まで。実務で使う機能を、迷わず使える形で。"
          />

          {/* zig 1: 署名欄配置 */}
          <div className="mb-20 grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <p className="text-[12.5px] font-bold text-[#2680EB]">署名欄の配置</p>
              <h3 className="mt-3 text-[25px] font-bold leading-[1.45] tracking-[-0.02em]">
                PDFの好きな位置に、
                <br />
                署名欄をドラッグで置く。
              </h3>
              <p className="mt-3.5 text-[15px] leading-[1.85] text-[#5A6575]">
                署名者ごとに、署名・印鑑・日付・テキストの欄を自由に配置。ページをまたいでも大丈夫です。テンプレートに保存すれば次回はそのまま使えます。
              </p>
              <ul className="mt-4 space-y-2.5">
                {['署名者を色分けして直感的に配置', '署名・印鑑・日付・テキストの4種'].map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 shrink-0 text-[#12805C]"><Check /></span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <VisChrome>
              <div className="flex h-[270px]">
                <div className="relative flex-1 bg-[#EEF1F5] p-4">
                  <div className="absolute inset-4 rounded bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,.08)]">
                    <div className="mb-3.5 h-[7px] rounded-sm bg-[#EDF0F4]" />
                    <div className="mb-3.5 h-[7px] rounded-sm bg-[#EDF0F4]" />
                    <div className="mb-3.5 h-[7px] w-[45%] rounded-sm bg-[#EDF0F4]" />
                    <div className="mb-3.5 mt-9 h-[7px] rounded-sm bg-[#EDF0F4]" />
                    <div className="h-[7px] w-[45%] rounded-sm bg-[#EDF0F4]" />
                  </div>
                  <div className="absolute left-11 top-20 grid h-9 w-[120px] place-items-center rounded-md border-[1.5px] border-dashed border-[#2680EB] bg-[#EAF2FD] text-[10px] font-semibold text-[#1B5FC4]">
                    署名 · 甲
                  </div>
                  <div className="absolute right-11 top-[130px] grid h-[30px] w-24 place-items-center rounded-md border-[1.5px] border-dashed border-[#2680EB] bg-[#EAF2FD] text-[10px] font-semibold text-[#1B5FC4]">
                    日付
                  </div>
                </div>
                <div className="w-[120px] shrink-0 border-l border-[#E6EBF1] bg-white p-2.5">
                  <p className="mb-2 text-[10px] font-bold text-[#8B95A5]">署名者</p>
                  {[
                    { n: '奥村 浩貴', c: '#2680EB' },
                    { n: '睦和 太郎', c: '#12805C' },
                  ].map((s, i) => (
                    <div key={s.n} className="flex items-center gap-1.5 py-1.5 text-[11px]">
                      <span className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: s.c }}>{i + 1}</span>
                      {s.n}
                    </div>
                  ))}
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {['署名', '印鑑', '日付', 'テキスト'].map((c) => (
                      <span key={c} className="rounded border border-[#E6EBF1] px-1.5 py-0.5 text-[9.5px] text-[#5A6575]">{c}</span>
                    ))}
                  </div>
                </div>
              </div>
            </VisChrome>
          </div>

          {/* zig 2: 送信と署名（逆順） */}
          <div className="mb-20 grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="order-1 lg:order-2">
              <p className="text-[12.5px] font-bold text-[#2680EB]">送信と署名</p>
              <h3 className="mt-3 text-[25px] font-bold leading-[1.45] tracking-[-0.02em]">
                順番に送って、
                <br />
                相手はその場で署名。
              </h3>
              <p className="mt-3.5 text-[15px] leading-[1.85] text-[#5A6575]">
                「甲が署名したら乙へ」と順序を指定して送信。相手はメールのリンクを開くだけ。アプリのインストールも会員登録も要りません。3日おきの自動リマインダーで督促も自動です。
              </p>
              <ul className="mt-4 space-y-2.5">
                {['順序つき署名・自動リマインダー', 'アクセスコードで本人確認も'].map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 shrink-0 text-[#12805C]"><Check /></span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="order-2 lg:order-1">
              <VisChrome>
                <div className="bg-[#F7F9FC] p-5">
                  <div className="mx-auto max-w-[300px] overflow-hidden rounded-[9px] border border-[#E6EBF1] bg-white shadow-[0_2px_8px_rgba(0,0,0,.05)]">
                    <div className="flex items-center gap-2 border-b border-[#E6EBF1] px-3.5 py-3 text-[11.5px] font-bold">
                      <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-[#2680EB] text-[8px] font-bold text-white">ok</span>
                      oku株式会社
                      <span className="ml-auto text-[9.5px] font-medium text-[#8B95A5]">電子署名</span>
                    </div>
                    <div className="p-3.5">
                      <p className="mb-1.5 text-[10.5px] text-[#5A6575]">奥村 浩貴 様より署名の依頼が届いています</p>
                      <p className="mb-2.5 text-[15px] font-bold">業務委託契約書</p>
                      <div className="relative mb-3 h-[74px] rounded-md border border-[#E6EBF1] bg-white">
                        <span className="absolute left-3 right-3 top-3.5 h-[5px] rounded-sm bg-[#EDF0F4]" />
                        <span className="absolute left-3 right-14 top-7 h-[5px] rounded-sm bg-[#EDF0F4]" />
                        <span className="absolute bottom-3 right-3.5 grid h-[26px] w-[72px] place-items-center rounded border-[1.4px] border-dashed border-[#2680EB] bg-[#EAF2FD] text-[8.5px] font-semibold text-[#1B5FC4]">
                          ここに署名
                        </span>
                      </div>
                      <div className="grid h-[34px] place-items-center rounded-[7px] bg-[#2680EB] text-xs font-semibold text-white">
                        署名して締結する
                      </div>
                    </div>
                  </div>
                </div>
              </VisChrome>
            </div>
          </div>

          {/* zig 3: 監査証跡と締結 */}
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <p className="text-[12.5px] font-bold text-[#2680EB]">監査証跡と締結</p>
              <h3 className="mt-3 text-[25px] font-bold leading-[1.45] tracking-[-0.02em]">
                締結の証拠を、
                <br />
                そのまま残す。
              </h3>
              <p className="mt-3.5 text-[15px] leading-[1.85] text-[#5A6575]">
                全員の署名が完了すると、署名証明ページつきのPDFを自動生成。送信・閲覧・署名・締結の全操作を、日時とIPアドレスつきで記録します。原本のハッシュ値で、改ざんされていないことも証明できます。
              </p>
              <ul className="mt-4 space-y-2.5">
                {['署名証明ページつきPDFを自動生成', 'SHA-256ハッシュで改ざん検知'].map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 shrink-0 text-[#12805C]"><Check /></span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <VisChrome>
              <div className="p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <p className="text-[15px] font-bold">業務委託契約書</p>
                  <MiniBadge label="締結済み" tone="ok" />
                </div>
                <dl className="border-t border-[#EFF3F8] text-[11.5px]">
                  <div className="grid grid-cols-[74px_1fr] border-b border-[#EFF3F8]">
                    <dt className="py-2 text-[#8B95A5]">書類ID</dt>
                    <dd className="py-2 font-mono text-[10px] text-[#5A6575]">01KXDAA0JX…SKY0</dd>
                  </div>
                  <div className="grid grid-cols-[74px_1fr] border-b border-[#EFF3F8]">
                    <dt className="py-2 text-[#8B95A5]">締結日</dt>
                    <dd className="py-2 font-medium tabular-nums">2026年7月14日 09:41</dd>
                  </div>
                  <div className="grid grid-cols-[74px_1fr] border-b border-[#EFF3F8]">
                    <dt className="py-2 text-[#8B95A5]">署名者</dt>
                    <dd className="py-2 font-medium">2名（順次署名・全員完了）</dd>
                  </div>
                </dl>
                <div className="mt-2.5 rounded-md bg-[#E3F3EC] px-3 py-2.5">
                  <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-[#12805C]">
                    <Check className="h-3 w-3" />
                    改ざんされていないことを確認できます
                  </p>
                  <p className="break-all font-mono text-[9px] leading-relaxed text-[#5A6575]">
                    SHA-256 6f9ad02c96c95347f0ffc3a29cae615f30dd23ca5b
                  </p>
                </div>
              </div>
            </VisChrome>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-[#F5F8FC] py-20">
        <div className="mx-auto max-w-[1080px] px-6">
          <SectionHead eyebrow="HOW IT WORKS" title="3ステップで、締結まで。" />
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { n: '1', t: 'PDFをアップロード', d: '契約書のPDFを上げて、署名欄をドラッグで配置。テンプレートからも作れます。' },
              { n: '2', t: '署名者に送信', d: '順番を指定して送信。相手はメールのリンクから、その場で署名します。' },
              { n: '3', t: '締結・自動保管', d: '全員の署名が完了すると、証明ページつきPDFを自動生成して保管します。' },
            ].map((s) => (
              <div key={s.n} className="rounded-xl border border-[#E6EBF1] bg-white p-6">
                <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-[#EAF2FD] text-sm font-bold text-[#1B5FC4]">{s.n}</span>
                <h3 className="mt-4 text-base font-bold">{s.t}</h3>
                <p className="mt-2 text-[13.5px] leading-[1.75] text-[#5A6575]">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-[1080px] px-6">
          <SectionHead
            eyebrow="PRICING"
            title="シンプルな料金。送信は無制限。"
            lead="okuパートナープログラムの特典としてご提供。自社利用は無料でご案内します。"
          />
          <div className="mx-auto grid max-w-[720px] gap-4 md:grid-cols-2">
            {/* 月額 */}
            <div className="rounded-[14px] border border-[#E6EBF1] bg-white p-7">
              <p className="text-sm font-bold">月額プラン</p>
              <p className="mt-3 text-[40px] font-extrabold tracking-[-0.02em] tabular-nums">
                ¥2,980<span className="text-[15px] font-medium text-[#8B95A5]"> / 月</span>
              </p>
              <p className="mt-1 text-[12.5px] text-[#8B95A5]">いつでも解約できます</p>
              <ul className="my-5 space-y-2.5">
                {['電子契約の送信 無制限', '署名欄の自由配置・テンプレート', '監査証跡つき署名済みPDF'].map((t) => (
                  <li key={t} className="flex items-start gap-2 text-[13.5px] text-[#5A6575]">
                    <span className="mt-0.5 shrink-0 text-[#12805C]"><Check /></span>
                    {t}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="flex h-[46px] w-full items-center justify-center rounded-[10px] border border-[#E6EBF1] bg-white text-[15px] font-semibold hover:bg-[#F5F8FC]"
              >
                月額で始める
              </Link>
            </div>
            {/* 年額 */}
            <div className="rounded-[14px] border border-[#CFE1FB] bg-white p-7 shadow-[0_0_0_1px_#CFE1FB,0_20px_50px_-30px_rgba(38,90,180,.3)]">
              <p className="flex items-center gap-2 text-sm font-bold">
                年額プラン
                <span className="rounded-full bg-[#EAF2FD] px-2.5 py-0.5 text-[11px] font-bold text-[#1B5FC4]">2ヶ月分お得</span>
              </p>
              <p className="mt-3 text-[40px] font-extrabold tracking-[-0.02em] tabular-nums">
                ¥25,000<span className="text-[15px] font-medium text-[#8B95A5]"> / 年</span>
              </p>
              <p className="mt-1 text-[12.5px] text-[#8B95A5]">月あたり約 ¥2,083</p>
              <ul className="my-5 space-y-2.5">
                {['月額プランのすべて', 'まとめて支払いで割安', '更新も自動で手間なし'].map((t) => (
                  <li key={t} className="flex items-start gap-2 text-[13.5px] text-[#5A6575]">
                    <span className="mt-0.5 shrink-0 text-[#12805C]"><Check /></span>
                    {t}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="flex h-[46px] w-full items-center justify-center rounded-[10px] bg-[#2680EB] text-[15px] font-semibold text-white shadow-[0_1px_2px_rgba(38,128,235,.3)] hover:bg-[#1B5FC4]"
              >
                年額で始める
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-[#1B5FC4] to-[#2680EB] py-20 text-center text-white">
        <div className="mx-auto max-w-[1080px] px-6">
          <h2 className="text-[clamp(28px,4vw,40px)] font-bold leading-[1.4] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>
            契約のスピードを、今日から変える。
          </h2>
          <p className="mx-auto mt-4 max-w-[440px] text-[15px] leading-[1.7] text-white/85">
            登録は数分。最初の1通から、その速さを実感してください。
          </p>
          <div className="mt-7 flex justify-center gap-3">
            <Link
              href="/signup"
              className="flex h-[46px] items-center rounded-[10px] bg-white px-6 text-[15px] font-semibold text-[#1B5FC4] hover:bg-[#EAF2FD]"
            >
              無料で始める
            </Link>
            <Link
              href="/login"
              className="flex h-[46px] items-center rounded-[10px] border border-white/40 px-6 text-[15px] font-semibold text-white hover:bg-white/10"
            >
              ログイン
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E6EBF1] bg-white py-10">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-2 text-sm font-bold">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-[#2680EB] text-[10px] font-bold text-white">ok</span>
            okuサイン
          </div>
          <div className="flex gap-5 text-[13px] text-[#5A6575]">
            <Link href="/terms" className="hover:text-[#141B2B]">利用規約</Link>
            <Link href="/privacy" className="hover:text-[#141B2B]">プライバシーポリシー</Link>
            <Link href="/legal" className="hover:text-[#141B2B]">特定商取引法に基づく表記</Link>
          </div>
          <p className="w-full text-[12.5px] text-[#8B95A5]">© 2026 oku株式会社</p>
        </div>
      </footer>
    </div>
  )
}
