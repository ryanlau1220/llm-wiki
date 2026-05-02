import { createFileRoute } from '@tanstack/react-router'
import { orpc } from '../lib/orpc'
import { useQuery } from '@tanstack/react-query'
import { 
  Database, 
  HardDrive, 
  Activity, 
  Clock, 
  ShieldCheck,
  AlertTriangle,
  FileText,
  TrendingUp,
  Award
} from 'lucide-react'

export const Route = createFileRoute('/')({
  component: DashboardComponent,
})

function DashboardComponent() {
  const { data: health, isLoading: healthLoading } = useQuery(
    orpc.health.queryOptions()
  )

  const { data: notes, isLoading: notesLoading } = useQuery(
    orpc.listNotes.queryOptions()
  )

  const stats = [
    { label: 'Database', status: health?.services?.database, icon: Database },
    { label: 'Vault', status: health?.services?.vault, icon: HardDrive },
    { label: 'API', status: health?.services?.api, icon: Activity },
  ]

  // Calculate average quality
  const scoredNotes = notes?.filter(n => n.qualityScore !== null) ?? []
  const avgQuality = scoredNotes.length > 0 
    ? (scoredNotes.reduce((acc, n) => acc + (n.qualityScore ?? 0), 0) / scoredNotes.length)
    : 0

  const lowQualityNotes = notes?.filter(n => (n.qualityScore ?? 1) < 0.5) ?? []

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
                  {healthLoading ? 'Checking...' : stat.status || 'Offline'}
                </span>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <div className="island-shell p-6 rounded-3xl border-b-4 border-b-[var(--lagoon)]">
          <div className="flex items-center justify-between mb-4">
            <FileText size={20} className="text-[var(--sea-ink-soft)]" />
            <span className="text-2xl font-bold text-[var(--sea-ink)]">{notes?.length ?? 0}</span>
          </div>
          <p className="text-xs font-bold uppercase text-[var(--sea-ink-soft)] tracking-wider">Total Notes</p>
        </div>
        
        <div className="island-shell p-6 rounded-3xl border-b-4 border-b-[var(--lagoon)]">
          <div className="flex items-center justify-between mb-4">
            <Award size={20} className="text-[var(--lagoon-deep)]" />
            <span className="text-2xl font-bold text-[var(--sea-ink)]">{(avgQuality * 100).toFixed(0)}%</span>
          </div>
          <p className="text-xs font-bold uppercase text-[var(--sea-ink-soft)] tracking-wider">Avg Quality</p>
        </div>

        <div className="island-shell p-6 rounded-3xl border-b-4 border-b-amber-500">
          <div className="flex items-center justify-between mb-4">
            <AlertTriangle size={20} className="text-amber-500" />
            <span className="text-2xl font-bold text-[var(--sea-ink)]">{lowQualityNotes.length}</span>
          </div>
          <p className="text-xs font-bold uppercase text-[var(--sea-ink-soft)] tracking-wider">Quality Alerts</p>
        </div>

        <div className="island-shell p-6 rounded-3xl border-b-4 border-b-[var(--sea-ink)]">
          <div className="flex items-center justify-between mb-4">
            <TrendingUp size={20} className="text-[var(--sea-ink)]" />
            <span className="text-2xl font-bold text-[var(--sea-ink)]">{healthLoading || notesLoading ? '...' : 'Live'}</span>
          </div>
          <p className="text-xs font-bold uppercase text-[var(--sea-ink-soft)] tracking-wider">Sync Status</p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section className="island-shell rounded-[2.5rem] p-8">
          <h2 className="display-title text-2xl font-bold text-[var(--sea-ink)] mb-6">Recent Activity</h2>
          <div className="space-y-4">
            {notesLoading ? (
               <p className="text-[var(--sea-ink-soft)] animate-pulse">Loading activity...</p>
            ) : notes && notes.length > 0 ? (
               <div className="space-y-3">
                 {notes.slice(0, 5).map(note => (
                   <div key={note.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-strong)] border border-[var(--line)]">
                     <span className="font-bold text-sm text-[var(--sea-ink)] truncate max-w-[200px]">{note.title || note.path}</span>
                     <span className={`text-[10px] font-black px-2 py-1 rounded-md uppercase ${
                       (note.qualityScore ?? 1) > 0.7 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                     }`}>
                       {((note.qualityScore ?? 0) * 100).toFixed(0)}% Health
                     </span>
                   </div>
                 ))}
               </div>
            ) : (
              <p className="text-[var(--sea-ink-soft)] italic">No notes found in vault.</p>
            )}
          </div>
        </section>

        <section className="island-shell rounded-[2.5rem] p-8 border-dashed border-2 border-[var(--lagoon)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="display-title text-2xl font-bold text-[var(--sea-ink)]">Intelligence Alerts</h2>
            <ShieldCheck size={24} className="text-[var(--lagoon-deep)]" />
          </div>
          
          <div className="space-y-4">
            {lowQualityNotes.length > 0 ? (
              lowQualityNotes.slice(0, 3).map(note => (
                <div key={note.id} className="p-4 bg-[var(--foam)] rounded-2xl border border-[var(--line)] flex items-start gap-4">
                  <AlertTriangle className="text-amber-500 shrink-0" size={20} />
                  <div>
                    <h4 className="font-bold text-[var(--sea-ink)] text-sm mb-1 truncate max-w-[250px]">Improve "{note.title || note.path}"</h4>
                    <p className="text-xs text-[var(--sea-ink-soft)]">
                      Scored low on coherence. Try using <strong className="text-[var(--lagoon-deep)] underline cursor-pointer">Refactor Note</strong> to clean it up.
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 bg-green-50 rounded-2xl border border-green-100 flex items-center gap-4">
                <Award className="text-green-600" size={20} />
                <p className="text-sm font-bold text-green-800">Knowledge base is healthy!</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
