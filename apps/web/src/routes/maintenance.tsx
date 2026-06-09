import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { orpc } from '../lib/orpc'
import { AlertTriangle, ShieldCheck, Sparkles, Loader2, ListChecks } from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/maintenance')({
  component: MaintenanceComponent,
})

function MaintenanceComponent() {
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Record<string, any[]>>({})

  const weakNotesQuery = useQuery(
    orpc.getWeakNotes.queryOptions({ minQualityScore: 0.55, maxResults: 50 })
  )

  const improveMutation = useMutation(
    orpc.getImprovementSuggestions.mutationOptions({
      onSuccess: (data, variables) => {
        setSuggestions(prev => ({ ...prev, [variables.documentId]: data }))
        setAnalyzingId(null)
      },
      onError: () => setAnalyzingId(null)
    })
  )

  const handleAnalyze = (documentId: string) => {
    setAnalyzingId(documentId)
    improveMutation.mutate({ documentId })
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-12">
        <h1 className="display-title text-4xl font-bold text-[var(--sea-ink)] mb-2">Maintenance</h1>
        <p className="text-[var(--sea-ink-soft)] text-lg">Identify weak notes and prioritize improvements.</p>
      </header>

      <section className="island-shell rounded-[2rem] p-8">
        <h2 className="island-kicker mb-6 flex items-center gap-2">
          <AlertTriangle size={14} /> Weak Notes
        </h2>

        {weakNotesQuery.isLoading && (
          <div className="text-[var(--sea-ink-soft)] flex items-center gap-2">
            <Loader2 className="animate-spin" size={18} />
            <span>Calculating quality metrics...</span>
          </div>
        )}

        {weakNotesQuery.isError && (
          <div className="text-red-600">Failed to load weak notes.</div>
        )}

        {weakNotesQuery.data?.length === 0 && (
          <div className="flex items-center gap-2 text-[var(--palm)]">
            <ShieldCheck size={18} />
            <span>No weak notes detected with current threshold.</span>
          </div>
        )}

        {weakNotesQuery.data?.length ? (
          <div className="space-y-6">
            {weakNotesQuery.data.map((note) => (
              <div
                key={note.id}
                className="p-6 rounded-[1.5rem] bg-white/30 border border-[var(--line)] transition-all hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="font-bold text-xl text-[var(--sea-ink)]">{note.title}</div>
                    <div className="text-xs text-[var(--sea-ink-soft)] mt-1">{note.path}</div>
                  </div>
                  <div className="text-xs font-bold bg-[var(--foam)] text-[var(--lagoon-deep)] px-3 py-1 rounded-full border border-[var(--line)]">
                    Score: {note.qualityScore?.toFixed(2) ?? 'n/a'}
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-6">
                  {note.reasons.map((r: string) => (
                    <span
                      key={r}
                      className="text-[10px] uppercase tracking-wider font-bold bg-[var(--surface-strong)] px-2.5 py-1 rounded-md border border-[var(--line)] text-[var(--sea-ink-soft)]"
                    >
                      {r.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>

                {suggestions[note.id] ? (
                  <div className="bg-[var(--foam)] rounded-xl p-5 border border-[var(--lagoon)] rise-in mb-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-[var(--lagoon-deep)] mb-4 flex items-center gap-2">
                      <ListChecks size={14} /> AI Improvement Roadmap
                    </h4>
                    <ul className="space-y-3">
                      {suggestions[note.id].map((s) => (
                        <li key={s.id} className="flex gap-3 text-sm">
                          <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[var(--lagoon)] shrink-0" />
                          <div>
                            <span className="font-bold text-[var(--sea-ink)]">{s.actionLabel}: </span>
                            <span className="text-[var(--sea-ink-soft)]">{s.description}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={analyzingId === note.id}
                  onClick={() => handleAnalyze(note.id)}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-sea-ink text-white dark:text-bg-base rounded-xl font-bold text-sm hover:bg-lagoon-deep hover:text-white dark:hover:text-bg-base transition-all disabled:opacity-50"
                >
                  {analyzingId === note.id ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Analyze Improvements
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}

