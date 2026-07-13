import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        <Header />
        <main className="flex-1">
          <div className="px-8 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
