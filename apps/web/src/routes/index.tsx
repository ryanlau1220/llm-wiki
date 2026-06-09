import { createFileRoute } from '@tanstack/react-router'
import { orpc } from '../lib/orpc'
import { useQuery } from '@tanstack/react-query'
import { 
  Database, 
  HardDrive, 
  Activity, 
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
    <div className="p-5 max-w-6xl mx-auto">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)] mb-1">Wiki Dashboard</h1>
          <p className="text-[var(--sea-ink-soft)] text-base">System status and knowledge intelligence overview.</p>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {stats.map((stat) => (
          <article 
            key={stat.label}
            className="island-shell p-5 rounded-xl flex items-center gap-4 transition-all hover:translate-y-[-2px]"
          >
            <div className={`p-3 rounded-lg ${
              stat.status === 'ok' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              <stat.icon size={22} />
            </div>
            <div>
              <h3 className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-widest mb-0.5">{stat.label}</h3>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${stat.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-bold text-base text-[var(--sea-ink)] capitalize">
                  {healthLoading ? 'Checking...' : stat.status || 'Offline'}
                </span>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="island-shell p-5 rounded-xl border-b-2 border-b-[var(--lagoon)]">
          <div className="flex items-center justify-between mb-3">
            <FileText size={18} className="text-[var(--sea-ink-soft)]" />
            <span className="text-xl font-bold text-[var(--sea-ink)]">{notes?.length ?? 0}</span>
          </div>
          <p className="text-[10px] font-bold uppercase text-[var(--sea-ink-soft)] tracking-wider">Total Notes</p>
        </div>
        
        <div className="island-shell p-5 rounded-xl border-b-2 border-b-[var(--lagoon)]">
          <div className="flex items-center justify-between mb-3">
            <Award size={18} className="text-[var(--lagoon-deep)]" />
            <span className="text-xl font-bold text-[var(--sea-ink)]">{(avgQuality * 100).toFixed(0)}%</span>
          </div>
          <p className="text-[10px] font-bold uppercase text-[var(--sea-ink-soft)] tracking-wider">Avg Quality</p>
        </div>

        <div className="island-shell p-5 rounded-xl border-b-2 border-b-amber-500">
          <div className="flex items-center justify-between mb-3">
            <AlertTriangle size={18} className="text-amber-500" />
            <span className="text-xl font-bold text-[var(--sea-ink)]">{lowQualityNotes.length}</span>
          </div>
          <p className="text-[10px] font-bold uppercase text-[var(--sea-ink-soft)] tracking-wider">Quality Alerts</p>
        </div>

        <div className="island-shell p-5 rounded-xl border-b-2 border-b-[var(--sea-ink)]">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp size={18} className="text-[var(--sea-ink)]" />
            <span className="text-xl font-bold text-[var(--sea-ink)]">{healthLoading || notesLoading ? '...' : 'Live'}</span>
          </div>
          <p className="text-[10px] font-bold uppercase text-[var(--sea-ink-soft)] tracking-wider">Sync Status</p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="island-shell rounded-xl p-5 bg-white/40">
          <h2 className="display-title text-xl font-bold text-[var(--sea-ink)] mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {notesLoading ? (
               <p className="text-sm text-[var(--sea-ink-soft)] animate-pulse">Loading activity...</p>
            ) : notes && notes.length > 0 ? (
               <div className="space-y-2">
                 {notes.slice(0, 5).map(note => (
                   <div key={note.id} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--surface-strong)] border border-[var(--line)]">
                     <span className="font-bold text-xs text-[var(--sea-ink)] truncate max-w-[200px]">{note.title || note.path}</span>
                     <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase ${
                       (note.qualityScore ?? 1) > 0.7 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                     }`}>
                       {((note.qualityScore ?? 0) * 100).toFixed(0)}% Health
                     </span>
                   </div>
                 ))}
               </div>
            ) : (
               <p className="text-sm text-[var(--sea-ink-soft)] italic">No notes found in vault.</p>
            )}
          </div>
        </section>

        <section className="island-shell rounded-xl p-5 border border-[var(--lagoon)] bg-white/40">
          <div className="flex items-center justify-between mb-4">
            <h2 className="display-title text-xl font-bold text-[var(--sea-ink)]">Intelligence Alerts</h2>
            <ShieldCheck size={20} className="text-[var(--lagoon-deep)]" />
          </div>
          
          <div className="space-y-3">
            {lowQualityNotes.length > 0 ? (
              lowQualityNotes.slice(0, 3).map(note => (
                <div key={note.id} className="p-3 bg-[var(--foam)] rounded-lg border border-[var(--line)] flex items-start gap-3">
                  <AlertTriangle className="text-amber-500 shrink-0" size={18} />
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-[var(--sea-ink)] text-xs mb-0.5 truncate">Improve "{note.title || note.path}"</h4>
                    <p className="text-[11px] text-[var(--sea-ink-soft)]">
                      Scored low on coherence. Try using <strong className="text-[var(--lagoon-deep)] underline cursor-pointer">Refactor Note</strong> to clean it up.
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-3 bg-green-50 rounded-lg border border-green-100 flex items-center gap-3">
                <Award className="text-green-600" size={18} />
                <p className="text-xs font-bold text-green-800">Knowledge base is healthy!</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
