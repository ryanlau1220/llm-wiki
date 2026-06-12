import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { orpc } from '../lib/orpc'
import { useQuery } from '@tanstack/react-query'
import { 
  Database, 
  HardDrive, 
  Activity, 
  ShieldCheck,
  AlertTriangle,
  FileText,
  Link2,
  Award,
  ExternalLink,
  Plus
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

  const { data: linkHealth, isLoading: linkHealthLoading } = useQuery(
    orpc.getLinkHealth.queryOptions()
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

  // Calculate total broken links count
  const totalBrokenLinks = linkHealth?.reduce((acc, l) => acc + l.count, 0) ?? 0

  const { data: settings } = useQuery(
    orpc.getSettings.queryOptions()
  )

  const [qualityPage, setQualityPage] = useState(1)
  const [unresolvedPage, setUnresolvedPage] = useState(1)
  const ITEMS_PER_PAGE = 3

  const getObsidianUri = (notePath: string) => {
    if (!settings?.vaultPath) return ''
    const vaultPathClean = settings.vaultPath.replace(/\\/g, '/')
    const vaultName = vaultPathClean.split('/').filter(Boolean).pop() || 'vault'
    return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(notePath)}`
  }

  const totalQualityPages = Math.ceil(lowQualityNotes.length / ITEMS_PER_PAGE)
  const displayedQualityNotes = lowQualityNotes.slice((qualityPage - 1) * ITEMS_PER_PAGE, qualityPage * ITEMS_PER_PAGE)

  const unresolvedLinks = linkHealth ?? []
  const totalUnresolvedPages = Math.ceil(unresolvedLinks.length / ITEMS_PER_PAGE)
  const displayedUnresolvedLinks = unresolvedLinks.slice((unresolvedPage - 1) * ITEMS_PER_PAGE, unresolvedPage * ITEMS_PER_PAGE)

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

        <div className="island-shell p-5 rounded-xl border-b-2 border-b-red-500">
          <div className="flex items-center justify-between mb-3">
            <Link2 size={18} className="text-red-500" />
            <span className="text-xl font-bold text-[var(--sea-ink)]">{linkHealthLoading ? '...' : totalBrokenLinks}</span>
          </div>
          <p className="text-[10px] font-bold uppercase text-[var(--sea-ink-soft)] tracking-wider">Unresolved Links</p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="island-shell rounded-xl p-5">
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

        <section className="island-shell rounded-xl p-5 border border-[var(--lagoon)] bg-surface-strong">
          <div className="flex items-center justify-between mb-4">
            <h2 className="display-title text-xl font-bold text-[var(--sea-ink)]">Intelligence Alerts</h2>
            <ShieldCheck size={20} className="text-[var(--lagoon-deep)]" />
          </div>
          
          <div className="space-y-4">
            {lowQualityNotes.length === 0 && (!linkHealth || linkHealth.length === 0) ? (
               <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-150 dark:border-green-900/30 flex items-center gap-3">
                 <Award className="text-green-600" size={18} />
                 <p className="text-xs font-bold text-green-800 dark:text-green-400">Knowledge base is healthy!</p>
               </div>
            ) : (
              <>
                {/* 1. Quality Alerts Section */}
                {lowQualityNotes.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-[10px] font-black text-[var(--sea-ink-soft)] uppercase tracking-wider mb-1">
                      Quality Alerts ({lowQualityNotes.length})
                    </h3>
                    <div className="space-y-2">
                      {displayedQualityNotes.map(note => (
                        <div key={note.id} className="p-3 bg-[var(--foam)] rounded-lg border border-[var(--line)] flex items-start gap-3 shadow-sm hover:translate-y-[-1px] transition-transform">
                          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-[var(--sea-ink)] text-xs mb-0.5 truncate">Improve "{note.title || note.path}"</h4>
                            <p className="text-[11px] text-[var(--sea-ink-soft)]">
                              Quality score is lower than threshold. Try using <Link to="/refactor" search={{ path: note.path }} className="text-[var(--lagoon-deep)] underline font-bold">Refactor Note</Link> to clean it up.
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {totalQualityPages > 1 && (
                      <div className="flex items-center justify-between pt-1 pb-2">
                        <button
                          type="button"
                          disabled={qualityPage === 1}
                          onClick={() => setQualityPage(prev => Math.max(1, prev - 1))}
                          className="px-2 py-0.5 text-[9px] font-bold bg-[var(--surface)] border border-[var(--line)] rounded-md hover:bg-[var(--line)] disabled:opacity-40 disabled:hover:bg-[var(--surface)] transition-all cursor-pointer text-[var(--sea-ink)]"
                        >
                          Prev
                        </button>
                        <span className="text-[9px] font-bold text-[var(--sea-ink-soft)]">
                          Page {qualityPage} of {totalQualityPages}
                        </span>
                        <button
                          type="button"
                          disabled={qualityPage === totalQualityPages}
                          onClick={() => setQualityPage(prev => Math.min(totalQualityPages, prev + 1))}
                          className="px-2 py-0.5 text-[9px] font-bold bg-[var(--surface)] border border-[var(--line)] rounded-md hover:bg-[var(--line)] disabled:opacity-40 disabled:hover:bg-[var(--surface)] transition-all cursor-pointer text-[var(--sea-ink)]"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Unresolved Links Section */}
                {unresolvedLinks.length > 0 && (
                  <div className="space-y-2.5 pt-1">
                    <h3 className="text-[10px] font-black text-[var(--sea-ink-soft)] uppercase tracking-wider mb-1">
                      Unresolved Links ({unresolvedLinks.length})
                    </h3>
                    <div className="space-y-2">
                      {displayedUnresolvedLinks.map(link => (
                        <div key={link.label} className="p-3 bg-[var(--foam)] rounded-lg border border-red-500/10 dark:border-red-500/20 shadow-sm flex flex-col gap-2.5 hover:translate-y-[-1px] transition-transform">
                          <div className="flex items-start gap-3">
                            <Link2 className="text-red-500 shrink-0 mt-0.5" size={16} />
                            <div className="min-w-0 flex-1">
                              <h4 className="font-bold text-[var(--sea-ink)] text-xs mb-0.5">
                                Unresolved Link: <code className="text-[var(--sea-ink)] font-mono text-[11px] bg-red-500/5 px-1 border-0">[[{link.label}]]</code>
                              </h4>
                              <p className="text-[11px] text-[var(--sea-ink-soft)] mb-2">
                                Referenced in {link.sourcePaths.length} note{link.sourcePaths.length > 1 ? 's' : ''}. Fix in the referencing vault files or bootstrap the note:
                              </p>

                              {/* Referencing files with Obsidian shortcut */}
                              <div className="flex flex-wrap gap-1.5 mb-2.5">
                                {link.sourcePaths.map((p: string) => {
                                  const name = p.split('/').pop()?.replace('.md', '') || p
                                  return (
                                    <a
                                      key={p}
                                      href={getObsidianUri(p)}
                                      className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[var(--surface)] hover:bg-[var(--line)] border border-[var(--line)] rounded text-[9px] font-bold text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] no-underline transition-colors cursor-pointer"
                                      title={`Open "${name}" in Obsidian`}
                                    >
                                      <span>{name}</span>
                                      <ExternalLink size={8} />
                                    </a>
                                  )
                                })}
                              </div>

                              {/* Quick Actions */}
                              <div className="flex items-center">
                                <Link
                                  to="/generator"
                                  search={{ mode: 'bootstrap', title: link.label } as any}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-sea-ink hover:bg-lagoon-deep text-bg-base hover:text-white font-bold text-[10px] rounded-md transition-all no-underline shadow-sm cursor-pointer"
                                >
                                  <Plus size={10} />
                                  Bootstrap Note
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {totalUnresolvedPages > 1 && (
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          disabled={unresolvedPage === 1}
                          onClick={() => setUnresolvedPage(prev => Math.max(1, prev - 1))}
                          className="px-2 py-0.5 text-[9px] font-bold bg-[var(--surface)] border border-[var(--line)] rounded-md hover:bg-[var(--line)] disabled:opacity-40 disabled:hover:bg-[var(--surface)] transition-all cursor-pointer text-[var(--sea-ink)]"
                        >
                          Prev
                        </button>
                        <span className="text-[9px] font-bold text-[var(--sea-ink-soft)]">
                          Page {unresolvedPage} of {totalUnresolvedPages}
                        </span>
                        <button
                          type="button"
                          disabled={unresolvedPage === totalUnresolvedPages}
                          onClick={() => setUnresolvedPage(prev => Math.min(totalUnresolvedPages, prev + 1))}
                          className="px-2 py-0.5 text-[9px] font-bold bg-[var(--surface)] border border-[var(--line)] rounded-md hover:bg-[var(--line)] disabled:opacity-40 disabled:hover:bg-[var(--surface)] transition-all cursor-pointer text-[var(--sea-ink)]"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
