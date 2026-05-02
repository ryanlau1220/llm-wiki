import { createFileRoute } from '@tanstack/react-router'
import { orpc } from '../lib/orpc'
import { useQuery } from '@tanstack/react-query'
import { 
  Database, 
  HardDrive, 
  Activity, 
  Clock, 
  ShieldCheck,
  AlertTriangle
} from 'lucide-react'

export const Route = createFileRoute('/')({
  component: DashboardComponent,
})

function DashboardComponent() {
  const { data: health, isLoading } = useQuery(
    orpc.health.queryOptions()
  )

  const stats = [
    { label: 'Database', status: health?.services?.database, icon: Database },
    { label: 'Vault', status: health?.services?.vault, icon: HardDrive },
    { label: 'API', status: health?.services?.api, icon: Activity },
  ]

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-12 flex items-center justify-between">
        <div>
          <h1 className="display-title text-5xl font-bold text-[var(--sea-ink)] mb-2">Wiki Dashboard</h1>
          <p className="text-[var(--sea-ink-soft)] text-lg">System status and knowledge intelligence overview.</p>
        </div>
        <div className="flex items-center gap-2 bg-[var(--surface-strong)] px-4 py-2 rounded-full border border-[var(--line)] shadow-sm">
          <Clock size={16} className="text-[var(--lagoon-deep)]" />
          <span className="text-xs font-bold text-[var(--sea-ink-soft)] uppercase tracking-wider">
            {health ? new Date(health.timestamp).toLocaleTimeString() : '--:--'}
          </span>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {stats.map((stat) => (
          <article 
            key={stat.label}
            className="island-shell p-6 rounded-3xl flex items-center gap-5 transition-all hover:translate-y-[-4px]"
          >
            <div className={`p-4 rounded-2xl ${
              stat.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              <stat.icon size={28} />
            </div>
            <div>
              <h3 className="text-xs uppercase font-bold text-[var(--sea-ink-soft)] tracking-widest mb-1">{stat.label}</h3>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${stat.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-bold text-lg text-[var(--sea-ink)] capitalize">
                  {isLoading ? 'Checking...' : stat.status || 'Offline'}
                </span>
              </div>
            </div>
          </article>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="island-shell rounded-[2.5rem] p-8">
          <h2 className="display-title text-2xl font-bold text-[var(--sea-ink)] mb-6">Recent Activity</h2>
          <div className="space-y-4">
            {/* Placeholder for real activity log */}
            <p className="text-[var(--sea-ink-soft)] italic">No recent file changes detected.</p>
          </div>
        </section>

        <section className="island-shell rounded-[2.5rem] p-8 border-dashed border-2 border-[var(--lagoon)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="display-title text-2xl font-bold text-[var(--sea-ink)]">Intelligence Alerts</h2>
            <ShieldCheck size={24} className="text-[var(--lagoon-deep)]" />
          </div>
          
          <div className="space-y-4">
            <div className="p-4 bg-[var(--foam)] rounded-2xl border border-[var(--line)] flex items-start gap-4">
              <AlertTriangle className="text-amber-500 shrink-0" size={20} />
              <div>
                <h4 className="font-bold text-[var(--sea-ink)] text-sm mb-1">Knowledge Gaps Detected</h4>
                <p className="text-xs text-[var(--sea-ink-soft)]">
                  3 notes have wikilinks to missing pages. Head to <strong className="text-[var(--lagoon-deep)] underline cursor-pointer">Link Health</strong> to fix them.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
