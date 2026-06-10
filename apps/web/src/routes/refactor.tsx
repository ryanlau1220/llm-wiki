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
  ListChecks
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
        <section className="island-shell rounded-xl p-5 overflow-hidden rise-in">
          <div className="relative mb-6">
            <Search className="absolute left-4 top-3 text-[var(--sea-ink-soft)]" size={18} />
            <input 
              type="text" 
              placeholder="Search notes to refactor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[var(--foam)] border border-[var(--line)] rounded-lg py-2.5 pl-11 pr-4 text-sm text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] shadow-inner"
            />
          </div>

          {isLoadingNotes || isLoadingWeakNotes ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-[var(--lagoon-deep)]" size={28} />
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto pr-1 space-y-2">
              {(() => {
                const weakNoteMap = new Map(weakNotes?.map(w => [w.path, w.reasons]) || []);
                const sortedNotes = filteredNotes ? [...filteredNotes].sort((a, b) => {
                  const aWeak = weakNoteMap.has(a.path);
                  const bWeak = weakNoteMap.has(b.path);
                  if (aWeak && !bWeak) return -1;
                  if (!aWeak && bWeak) return 1;
                  return 0;
                }) : [];

                if (sortedNotes.length === 0) {
                  return (
                    <div className="text-center py-12 text-sm text-[var(--sea-ink-soft)] italic">
                      No notes found.
                    </div>
                  );
                }

                return sortedNotes.map((note) => {
                  const reasons = weakNoteMap.get(note.path);
                  const isWeak = !!reasons;

                  return (
                    <button
                      type="button"
                      key={note.id}
                      onClick={() => handleRefactor(note.path)}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl hover:bg-[var(--foam)] border border-transparent hover:border-[var(--line)] transition-all group text-left cursor-pointer"
                    >
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        <div className="p-2 bg-surface rounded-lg shadow-sm shrink-0 border border-line mt-0.5">
                          <FileText size={16} className="text-[var(--sea-ink-soft)]" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5">
                            <h4 className="font-bold text-sm text-[var(--sea-ink)] truncate">
                              {note.title || note.path.split('/').pop()?.replace('.md', '')}
                            </h4>
                            {note.qualityScore !== null && note.qualityScore !== undefined && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                                isWeak
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-450 dark:border-amber-900/30'
                                  : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-450 dark:border-green-900/30'
                              }`}>
                                Score: {note.qualityScore.toFixed(2)}
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-[var(--sea-ink-soft)] font-mono truncate mt-0.5 mb-1">{note.path}</div>

                          {isWeak && reasons && reasons.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {reasons.map((r: string) => (
                                <span
                                  key={r}
                                  className="text-[9px] uppercase tracking-wider font-bold bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-450 px-2 py-0.5 rounded border border-amber-100 dark:border-amber-900/30"
                                >
                                  {r.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <ChevronRight size={18} className="text-[var(--line)] group-hover:text-[var(--lagoon-deep)] transition-colors shrink-0 ml-4" />
                    </button>
                  );
                });
              })()}
            </div>
          )}
        </section>
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
            <div className="island-shell p-16 rounded-xl text-center flex flex-col items-center">
              <RotateCcw className="animate-spin text-[var(--lagoon-deep)] mb-4" size={48} />
              <h3 className="text-xl font-bold text-[var(--sea-ink)] mb-1">Analyzing Note</h3>
              <p className="text-sm text-[var(--sea-ink-soft)]">AI is restructuring your content for better clarity...</p>
            </div>
          )}

          {previewData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <article className="island-shell p-5 rounded-xl flex flex-col h-[32rem]">
                <h3 className="island-kicker mb-3 flex items-center gap-2">Original Content</h3>
                <div className="flex-1 overflow-y-auto pr-1">
                  <pre className="text-xs text-[var(--sea-ink-soft)] whitespace-pre-wrap font-mono select-text leading-relaxed">
                    {previewData.originalContent}
                  </pre>
                </div>
              </article>

              <div className="flex flex-col gap-5">
                {previewData.improvements && previewData.improvements.length > 0 && (
                  <div className="island-shell p-5 rounded-xl">
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

                <article className="island-shell p-5 rounded-xl border border-[var(--lagoon)] bg-surface-strong relative flex flex-col h-[28rem]">
                  <div className="absolute top-0 right-0 p-2 bg-[var(--lagoon)] text-[9px] font-bold uppercase tracking-widest rounded-tr-xl rounded-bl-lg text-white">
                    Refactored Preview
                  </div>
                  <h3 className="island-kicker mb-4 flex items-center gap-2 text-[var(--lagoon-deep)] shrink-0">
                    <CheckCircle2 size={12} /> AI Improvements
                  </h3>
                  
                  <div className="flex-1 flex flex-col min-h-0 space-y-3">
                    <div className="text-lg font-bold text-[var(--sea-ink)] shrink-0">{previewData.note.title}</div>
                    <div className="flex-1 text-xs text-[var(--sea-ink)] bg-surface p-3 rounded-lg border border-[var(--line)] whitespace-pre-wrap font-mono overflow-y-auto">
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
            <div className="p-8 island-shell rounded-xl text-center">
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
