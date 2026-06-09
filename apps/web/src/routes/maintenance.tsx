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
    <div className="p-5 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)] mb-1">Maintenance</h1>
        <p className="text-[var(--sea-ink-soft)] text-base">Identify weak notes and prioritize improvements.</p>
      </header>

      <section className="island-shell rounded-xl p-5 bg-white/40">
        <h2 className="island-kicker mb-4 flex items-center gap-2">
          <AlertTriangle size={12} /> Weak Notes
        </h2>

        {weakNotesQuery.isLoading && (
          <div className="text-[var(--sea-ink-soft)] flex items-center gap-2 text-xs">
            <Loader2 className="animate-spin" size={14} />
            <span>Calculating quality metrics...</span>
          </div>
        )}

        {weakNotesQuery.isError && (
          <div className="text-red-600 text-xs font-semibold">Failed to load weak notes.</div>
        )}

        {weakNotesQuery.data?.length === 0 && (
          <div className="flex items-center gap-2 text-[var(--palm)] text-xs font-semibold">
            <ShieldCheck size={16} />
            <span>No weak notes detected with current threshold.</span>
          </div>
        )}

        {weakNotesQuery.data?.length ? (
          <div className="space-y-4">
            {weakNotesQuery.data.map((note) => (
              <div
                key={note.id}
                className="p-4 rounded-xl bg-white/30 border border-[var(--line)] transition-all hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="font-bold text-base text-[var(--sea-ink)]">{note.title}</div>
                    <div className="text-[11px] text-[var(--sea-ink-soft)] mt-0.5">{note.path}</div>
                  </div>
                  <div className="text-[10px] font-bold bg-[var(--foam)] text-[var(--lagoon-deep)] px-2.5 py-0.5 rounded-full border border-[var(--line)]">
                    Score: {note.qualityScore?.toFixed(2) ?? 'n/a'}
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {note.reasons.map((r: string) => (
                    <span
                      key={r}
                      className="text-[9px] uppercase tracking-wider font-bold bg-[var(--surface-strong)] px-2 py-0.5 rounded-md border border-[var(--line)] text-[var(--sea-ink-soft)]"
                    >
                      {r.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>

                {suggestions[note.id] ? (
                  <div className="bg-[var(--foam)] rounded-lg p-4 border border-[var(--lagoon)] rise-in mb-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-[var(--lagoon-deep)] mb-3 flex items-center gap-1.5">
                      <ListChecks size={12} /> AI Improvement Roadmap
                    </h4>
                    <ul className="space-y-2">
                      {suggestions[note.id].map((s) => (
                        <li key={s.id} className="flex gap-2 text-xs">
                          <div className="mt-1.5 w-1 h-1 rounded-full bg-[var(--lagoon)] shrink-0" />
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
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-sea-ink text-bg-base rounded-lg font-bold text-xs hover:bg-lagoon-deep hover:text-bg-base transition-all disabled:opacity-50 cursor-pointer"
                >
                  {analyzingId === note.id ? (
                    <>
                      <Loader2 className="animate-spin" size={14} />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
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
