import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { orpc } from '../lib/orpc'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { 
  RotateCcw, 
  FileText, 
  Loader2, 
  ChevronRight, 
  CheckCircle2,
  AlertCircle,
  Save,
  Search,
  ListChecks,
  AlertTriangle
} from 'lucide-react'

export const Route = createFileRoute('/refactor')({
  validateSearch: z.object({
    path: z.string().optional(),
  }),
  component: RefactorComponent,
})

function RefactorComponent() {
  const navigate = useNavigate()
  const { path } = Route.useSearch()
  const [selectedPath, setSelectedPath] = useState<string | null>(path || null)
  const [previewData, setPreviewData] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [checkedSuggestions, setCheckedSuggestions] = useState<Record<string, boolean>>({})
  const [landingTab, setLandingTab] = useState<'weak' | 'all'>('weak')

  useEffect(() => {
    if (previewData) {
      setCheckedSuggestions({})
    }
  }, [previewData])

  const { data: notes, isLoading: isLoadingNotes } = useQuery(
    orpc.listNotes.queryOptions()
  )

  const { data: weakNotes, isLoading: isLoadingWeakNotes } = useQuery(
    orpc.getWeakNotes.queryOptions({ minQualityScore: 0.55, maxResults: 50 })
  )

  const previewMutation = useMutation(
    orpc.refactorPreview.mutationOptions({
      onSuccess: (data) => {
        setPreviewData(data)
        setSaveStatus(null)
      }
    })
  )

  const { mutate: previewMutate } = previewMutation

  // Run refactor analysis immediately on mount if path is provided in query params
  useEffect(() => {
    if (path) {
      setSelectedPath(path)
      previewMutate({ path })
    }
  }, [path, previewMutate])

  const confirmMutation = useMutation(
    orpc.confirmRefactorSave.mutationOptions({
      onSuccess: (data) => {
        if (data.status === 'rejected') {
          setSaveStatus({ type: 'error', message: `Refactor save rejected: ${data.error?.replace(/_/g, ' ')}` })
        } else {
          setSaveStatus({ type: 'success', message: 'Note successfully refactored and saved!' })
          setPreviewData(null)
          setSelectedPath(null)
          navigate({ to: '/refactor', search: { path: undefined } })
        }
      }
    })
  )

  const handleRefactor = (targetPath: string) => {
    setSelectedPath(targetPath)
    navigate({ to: '/refactor', search: { path: targetPath } })
  }

  const filteredNotes = notes?.filter(note => 
    note.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.title?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-5 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)] mb-1">Note Refactor</h1>
        <p className="text-[var(--sea-ink-soft)] text-base">Clean up and structure messy notes using AI.</p>
      </header>

      {saveStatus && (
        <div className={`p-4 mb-6 border rounded-xl flex items-center gap-3 ${
          saveStatus.type === 'success' 
            ? 'bg-green-50 border-green-100 text-green-700' 
            : 'bg-amber-50 border-amber-100 text-amber-700'
        }`}>
          {saveStatus.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span className="text-sm font-medium">{saveStatus.message}</span>
        </div>
      )}

      {!selectedPath ? (
        <div className="space-y-6">
          {/* Sub-tabs switcher */}
          <div className="flex bg-[var(--foam)] p-1 rounded-xl max-w-md border border-[var(--line)]">
            <button
              type="button"
              onClick={() => setLandingTab('weak')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                landingTab === 'weak'
                  ? 'bg-white text-[var(--sea-ink)] shadow-sm border border-[var(--line)]'
                  : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
              }`}
            >
              <AlertTriangle size={14} className="text-amber-500" />
              Needs Refactoring
            </button>
            <button
              type="button"
              onClick={() => setLandingTab('all')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                landingTab === 'all'
                  ? 'bg-white text-[var(--sea-ink)] shadow-sm border border-[var(--line)]'
                  : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
              }`}
            >
              <Search size={14} />
              Search All Notes
            </button>
          </div>

          {landingTab === 'weak' ? (
            <section className="island-shell rounded-xl p-5 bg-white/40 rise-in">
              <h2 className="island-kicker mb-4 flex items-center gap-2">
                <AlertTriangle size={12} className="text-amber-500" /> Notes Needing Refactoring
              </h2>

              {isLoadingWeakNotes && (
                <div className="text-[var(--sea-ink-soft)] flex items-center gap-2 text-xs py-10 justify-center">
                  <Loader2 className="animate-spin" size={18} />
                  <span>Calculating note metrics...</span>
                </div>
              )}

              {weakNotes && weakNotes.length === 0 && (
                <div className="text-center py-12 text-sm text-[var(--palm)] font-bold flex items-center justify-center gap-2">
                  <CheckCircle2 size={18} className="text-green-600" />
                  <span>No weak notes detected. Your vault is fully optimized!</span>
                </div>
              )}

              {weakNotes && weakNotes.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1">
                  {weakNotes.map((note) => (
                    <article
                      key={note.id}
                      className="p-4 rounded-xl bg-white/35 border border-[var(--line)] flex flex-col justify-between hover:shadow-sm transition-all"
                    >
                      <div className="mb-4">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <h3 className="font-bold text-sm text-[var(--sea-ink)] line-clamp-1">{note.title}</h3>
                          <span className="text-[10px] font-bold bg-[var(--foam)] text-[var(--lagoon-deep)] px-2 py-0.5 rounded-full border border-[var(--line)] shrink-0">
                            Score: {note.qualityScore?.toFixed(2) ?? 'n/a'}
                          </span>
                        </div>
                        <div className="text-[10px] text-[var(--sea-ink-soft)] font-mono truncate mb-3">{note.path}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {note.reasons.map((r: string) => (
                            <span
                              key={r}
                              className="text-[9px] uppercase tracking-wider font-bold bg-[var(--surface-strong)] px-2 py-0.5 rounded border border-[var(--line)] text-[var(--sea-ink-soft)]"
                            >
                              {r.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRefactor(note.path)}
                        className="w-full flex items-center justify-center gap-1.5 py-2 bg-sea-ink text-bg-base hover:bg-lagoon-deep hover:text-bg-base rounded-lg text-xs font-bold transition-all cursor-pointer"
                      >
                        <RotateCcw size={12} />
                        Refactor Note
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section className="island-shell rounded-xl p-5 overflow-hidden bg-white/40 rise-in">
              <div className="relative mb-4">
                <Search className="absolute left-4 top-3 text-[var(--sea-ink-soft)]" size={18} />
                <input 
                  type="text" 
                  placeholder="Search notes to refactor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[var(--foam)] border border-[var(--line)] rounded-lg py-2.5 pl-11 pr-4 text-sm text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] shadow-inner"
                />
              </div>

              {isLoadingNotes ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="animate-spin text-[var(--lagoon-deep)]" size={28} />
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto pr-1 space-y-1.5">
                  {filteredNotes?.map((note) => (
                    <button
                      type="button"
                      key={note.id}
                      onClick={() => handleRefactor(note.path)}
                      className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[var(--foam)] border border-transparent hover:border-[var(--line)] transition-all group text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-1.5 bg-white rounded-md shadow-sm shrink-0 border border-line">
                          <FileText size={16} className="text-[var(--sea-ink-soft)]" />
                        </div>
                        <div className="truncate">
                          <div className="font-bold text-sm text-[var(--sea-ink)] truncate">{note.title || note.path.split('/').pop()}</div>
                          <div className="text-[11px] text-[var(--sea-ink-soft)] truncate">{note.path}</div>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-[var(--line)] group-hover:text-[var(--lagoon-deep)] transition-colors shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      ) : (
        <section className="rise-in">
          <div className="flex items-center gap-3 mb-6">
            <button 
              type="button"
              onClick={() => { 
                setSelectedPath(null); 
                setPreviewData(null); 
                navigate({ to: '/refactor', search: { path: undefined } })
              }}
              className="p-1.5 hover:bg-[var(--line)] rounded-full text-[var(--sea-ink-soft)] transition-colors cursor-pointer"
            >
              <ChevronRight size={20} className="rotate-180" />
            </button>
            <h2 className="text-xl font-bold text-[var(--sea-ink)]">Refactoring: {selectedPath.split('/').pop()}</h2>
          </div>

          {previewMutation.isPending && (
            <div className="island-shell p-16 rounded-xl text-center flex flex-col items-center bg-white/40">
              <RotateCcw className="animate-spin text-[var(--lagoon-deep)] mb-4" size={48} />
              <h3 className="text-xl font-bold text-[var(--sea-ink)] mb-1">Analyzing Note</h3>
              <p className="text-sm text-[var(--sea-ink-soft)]">AI is restructuring your content for better clarity...</p>
            </div>
          )}

          {previewData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <article className="island-shell p-5 rounded-xl bg-white/40 flex flex-col h-[32rem]">
                <h3 className="island-kicker mb-3 flex items-center gap-2">Original Content</h3>
                <div className="flex-1 overflow-y-auto pr-1">
                  <pre className="text-xs text-[var(--sea-ink-soft)] whitespace-pre-wrap font-mono select-text leading-relaxed">
                    {previewData.originalContent}
                  </pre>
                </div>
              </article>

              <div className="flex flex-col gap-5">
                {previewData.improvements && previewData.improvements.length > 0 && (
                  <div className="island-shell p-5 rounded-xl bg-white/40 border border-[var(--line)]">
                    <h3 className="island-kicker mb-3 flex items-center gap-1.5 text-[var(--lagoon-deep)]">
                      <ListChecks size={14} /> Quality Improvement Roadmap
                    </h3>
                    <ul className="space-y-2.5">
                      {previewData.improvements.map((s: any) => {
                        const isChecked = !!checkedSuggestions[s.id || s.actionLabel];
                        return (
                          <li key={s.id || s.actionLabel} className="text-xs">
                            <label className="flex items-start gap-2.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => setCheckedSuggestions(prev => ({
                                  ...prev,
                                  [s.id || s.actionLabel]: !isChecked
                                }))}
                                className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-[var(--lagoon)] focus:ring-[var(--lagoon)] cursor-pointer shrink-0"
                              />
                              <div>
                                <span className={`font-bold text-[var(--sea-ink)] ${isChecked ? 'line-through opacity-50' : ''}`}>{s.actionLabel}: </span>
                                <span className={`text-[var(--sea-ink-soft)] ${isChecked ? 'line-through opacity-50' : ''}`}>{s.description}</span>
                              </div>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                <article className="island-shell p-5 rounded-xl border border-[var(--lagoon)] bg-white/50 relative flex flex-col h-[28rem]">
                  <div className="absolute top-0 right-0 p-2 bg-[var(--lagoon)] text-[9px] font-bold uppercase tracking-widest rounded-tr-xl rounded-bl-lg text-white">
                    Refactored Preview
                  </div>
                  <h3 className="island-kicker mb-4 flex items-center gap-2 text-[var(--lagoon-deep)] shrink-0">
                    <CheckCircle2 size={12} /> AI Improvements
                  </h3>
                  
                  <div className="flex-1 flex flex-col min-h-0 space-y-3">
                    <div className="text-lg font-bold text-[var(--sea-ink)] shrink-0">{previewData.note.title}</div>
                    <div className="flex-1 text-xs text-[var(--sea-ink)] bg-white/40 p-3 rounded-lg border border-[var(--line)] whitespace-pre-wrap font-mono overflow-y-auto">
                      {previewData.note.content}
                    </div>
                  </div>
                </article>

                <button
                  type="button"
                  onClick={() => confirmMutation.mutate({
                    requestId: previewData.requestId,
                    sourcePath: selectedPath,
                    note: {
                      title: previewData.note.title,
                      content: previewData.note.content,
                      tags: previewData.note.tags,
                      links: previewData.note.links
                    }
                  })}
                  disabled={confirmMutation.isPending}
                  className="w-full py-3 bg-sea-ink text-bg-base rounded-lg font-bold text-base hover:bg-lagoon-deep hover:text-bg-base shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {confirmMutation.isPending ? <Loader2 className="animate-spin" /> : <><Save size={16} /> Save Refactored Version</>}
                </button>
              </div>
            </div>
          )}

          {previewMutation.isError && (
            <div className="p-8 island-shell rounded-xl text-center bg-white/40">
              <AlertCircle className="text-red-500 mx-auto mb-3" size={36} />
              <h3 className="text-lg font-bold text-red-700">Refactor Failed</h3>
              <p className="text-sm text-red-600 mb-4">Something went wrong while refactoring the note.</p>
              <button 
                type="button"
                onClick={() => handleRefactor(selectedPath)}
                className="px-5 py-2 bg-sea-ink text-bg-base rounded-lg font-bold text-sm cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
