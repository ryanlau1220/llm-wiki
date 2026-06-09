import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { orpc } from '../lib/orpc'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { 
  BookOpen, 
  Search, 
  FileText, 
  Sparkles, 
  RefreshCw, 
  Info,
  Calendar,
  AlertTriangle,
  Loader2,
  CheckCircle,
  Copy
} from 'lucide-react'

export const Route = createFileRoute('/vault')({
  component: VaultComponent,
})

function VaultComponent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)

  const { data: notes, isLoading: isLoadingNotes } = useQuery(
    orpc.listNotes.queryOptions()
  )

  const { data: activeNote, isLoading: isLoadingActiveNote } = useQuery({
    ...orpc.getNote.queryOptions({ input: { id: selectedNoteId ?? '' } }),
    enabled: !!selectedNoteId,
  })

  const reindexMutation = useMutation(
    orpc.reindex.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.listNotes.queryKey() })
        if (selectedNoteId) {
          queryClient.invalidateQueries({ queryKey: orpc.getNote.queryKey({ input: { id: selectedNoteId } }) })
        }
      }
    })
  )

  const filteredNotes = notes?.filter(note => 
    note.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.title?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path)
    setCopiedPath(path)
    setTimeout(() => setCopiedPath(null), 2000)
  }

  const getScoreColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'text-slate-400 bg-slate-100 border-slate-200'
    if (score >= 0.75) return 'text-green-700 bg-green-50 border-green-200'
    if (score >= 0.5) return 'text-amber-700 bg-amber-50 border-amber-200'
    return 'text-red-700 bg-red-50 border-red-200'
  }

  const getScoreBadge = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'N/A'
    return `${(score * 100).toFixed(0)}%`
  }

  return (
    <div className="p-8 max-w-7xl mx-auto h-[calc(100vh-2rem)] flex flex-col">
      <header className="mb-8 shrink-0">
        <h1 className="display-title text-4xl font-bold text-sea-ink mb-2">Wiki Pages</h1>
        <p className="text-sea-ink-soft text-lg">Explore and manage notes stored in your local knowledge vault.</p>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-0">
        {/* Notes List Column */}
        <section className="lg:col-span-1 island-shell rounded-[2.5rem] p-6 flex flex-col min-h-0 bg-white/40">
          <div className="relative mb-6 shrink-0">
            <Search className="absolute left-4 top-3.5 text-sea-ink-soft" size={20} />
            <input 
              type="text" 
              placeholder="Search wiki pages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-foam border border-line rounded-xl py-3 pl-12 pr-4 text-sea-ink focus:outline-none focus:ring-2 focus:ring-lagoon shadow-inner"
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-2 space-y-2">
            {isLoadingNotes ? (
              <div className="flex justify-center items-center py-20">
                <Loader2 className="animate-spin text-lagoon-deep" size={32} />
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center py-20 text-sea-ink-soft italic">
                No notes found matching search.
              </div>
            ) : (
              filteredNotes.map((note) => {
                const isActive = note.id === selectedNoteId
                const isAI = note.path.includes('ai-generated/') || (note.qualityMetrics?.is_ai)
                
                return (
                  <button
                    type="button"
                    key={note.id}
                    onClick={() => setSelectedNoteId(note.id)}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all text-left group ${
                      isActive 
                        ? 'bg-nav-active-bg border-lagoon text-nav-active-text shadow-lg font-medium scale-[1.01]' 
                        : 'bg-white/50 border-transparent hover:bg-foam hover:border-line'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className={`font-bold truncate ${isActive ? 'text-nav-active-text' : 'text-sea-ink'}`}>
                        {note.title || note.path.split('/').pop()?.replace('.md', '')}
                      </div>
                      <div className={`text-xs truncate mt-0.5 ${isActive ? 'text-nav-active-text/80' : 'text-sea-ink-soft'}`}>
                        {note.path}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      {isAI && (
                        <span className={`text-[9px] uppercase tracking-widest font-black px-2 py-0.5 rounded ${
                          isActive ? 'bg-nav-active-text/10 text-nav-active-text' : 'bg-lagoon/15 text-lagoon-deep'
                        }`}>
                          AI
                        </span>
                      )}
                      <span className={`text-[10px] font-black px-2 py-1 rounded-md border ${
                        isActive 
                          ? 'bg-nav-active-text/10 border-nav-active-text/20 text-nav-active-text' 
                          : getScoreColor(note.qualityScore)
                      }`}>
                        {getScoreBadge(note.qualityScore)}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </section>

        {/* Note Detail Panel */}
        <section className="lg:col-span-2 flex flex-col min-h-0">
          {isLoadingActiveNote ? (
            <div className="island-shell rounded-[2.5rem] p-8 flex-1 flex flex-col justify-center items-center bg-white/40">
              <Loader2 className="animate-spin text-lagoon-deep mb-4" size={48} />
              <p className="text-sea-ink-soft font-bold">Loading note content...</p>
            </div>
          ) : activeNote ? (
            <div className="island-shell rounded-[2.5rem] p-8 flex-1 flex flex-col min-h-0 bg-white/40 relative overflow-hidden rise-in">
              {/* Header Info */}
              <div className="border-b border-line pb-6 mb-6 shrink-0">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                  <h2 className="display-title text-3xl font-bold text-sea-ink leading-tight">{activeNote.title}</h2>
                  <div className="flex gap-2">
                    <span className={`text-xs font-black px-3.5 py-1.5 rounded-full border ${getScoreColor(activeNote.qualityScore)}`}>
                      Quality: {getScoreBadge(activeNote.qualityScore)}
                    </span>
                    <span className="text-xs font-bold bg-foam border border-line text-sea-ink-soft px-3.5 py-1.5 rounded-full capitalize">
                      {activeNote.type.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-sea-ink-soft">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText size={16} className="shrink-0" />
                    <span className="truncate font-mono">
                      {activeNote.path}
                    </span>
                    <button 
                      type="button" 
                      onClick={() => handleCopyPath(activeNote.path)} 
                      className="p-1 rounded hover:bg-foam text-sea-ink-soft shrink-0"
                      title="Copy path"
                    >
                      {copiedPath === activeNote.path ? <CheckCircle size={14} className="text-green-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Calendar size={16} />
                    <span>Updated {new Date(activeNote.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {/* Grid Content/Metadata split */}
              <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-6 min-h-0 mb-6">
                {/* Markdown content */}
                <div className="xl:col-span-2 flex flex-col min-h-0 bg-white/35 rounded-2xl border border-line p-6 shadow-inner">
                  <h3 className="island-kicker mb-3">Document Content</h3>
                  <div className="flex-1 overflow-y-auto pr-1">
                    <pre className="text-sm font-sans text-sea-ink leading-relaxed whitespace-pre-wrap select-text selection:bg-lagoon/20">
                      {activeNote.content}
                    </pre>
                  </div>
                </div>

                {/* Metadata / Details */}
                <div className="xl:col-span-1 space-y-6 overflow-y-auto pr-1">
                  <div className="bg-foam/80 rounded-2xl border border-line p-5">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-sea-ink-soft mb-4 flex items-center gap-2">
                      <Info size={14} /> Quality Metrics
                    </h4>
                    {activeNote.qualityMetrics ? (
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-xs text-sea-ink-soft font-bold mb-1">
                            <span>Link Density</span>
                            <span>{(activeNote.qualityMetrics.link_density ?? 0).toFixed(2)}</span>
                          </div>
                          <div className="w-full bg-line h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-lagoon h-full" 
                              style={{ width: `${Math.min((activeNote.qualityMetrics.link_density ?? 0) * 100, 100)}%` }} 
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-xs text-sea-ink-soft font-bold mb-1">
                            <span>Completeness</span>
                            <span>{activeNote.qualityMetrics.has_title && activeNote.qualityMetrics.has_tags ? '100%' : '50%'}</span>
                          </div>
                          <div className="w-full bg-line h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-palm h-full" 
                              style={{ width: activeNote.qualityMetrics.has_title && activeNote.qualityMetrics.has_tags ? '100%' : '50%' }} 
                            />
                          </div>
                        </div>

                        {activeNote.qualityMetrics.reasons?.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-line">
                            <span className="text-[10px] uppercase font-bold text-sea-ink-soft tracking-wider block mb-2">Quality Alerts</span>
                            <div className="space-y-1.5">
                              {activeNote.qualityMetrics.reasons.map((r: string) => (
                                <div key={r} className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded border border-amber-100 font-medium">
                                  <AlertTriangle size={12} className="shrink-0" />
                                  <span className="truncate">{r.replace(/_/g, ' ')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-sea-ink-soft italic">No metrics parsed.</p>
                    )}
                  </div>

                  {/* Actions Box */}
                  <div className="bg-white/45 border border-line rounded-2xl p-5 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-sea-ink-soft mb-2">Actions</h4>
                    
                    <button
                      type="button"
                      onClick={() => navigate({ to: '/refactor', search: { path: activeNote.path } })}
                    className="w-full py-3 bg-sea-ink text-bg-base font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-lagoon-deep hover:text-bg-base transition-colors shadow"
                    >
                      <Sparkles size={16} />
                      Refactor Note
                    </button>

                    <button
                      type="button"
                      disabled={reindexMutation.isPending}
                      onClick={() => reindexMutation.mutate({ path: activeNote.path })}
                      className="w-full py-3 bg-foam border border-line text-sea-ink font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-line transition-colors"
                    >
                      <RefreshCw size={16} className={reindexMutation.isPending ? 'animate-spin' : ''} />
                      {reindexMutation.isPending ? 'Reindexing...' : 'Reindex Note'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="island-shell rounded-[2.5rem] p-8 flex-1 flex flex-col justify-center items-center bg-white/40 text-center">
              <BookOpen className="text-sea-ink-soft opacity-30 mb-4" size={64} />
              <h3 className="text-2xl font-bold text-sea-ink mb-2">No Note Selected</h3>
              <p className="text-sea-ink-soft max-w-sm">Select a note from the sidebar list to inspect its contents, check quality scores, and perform actions.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
