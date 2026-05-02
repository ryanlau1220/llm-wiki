import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { orpc } from '../lib/orpc'
import { AlertTriangle, ShieldCheck } from 'lucide-react'

export const Route = createFileRoute('/maintenance')({
  component: MaintenanceComponent,
})

function MaintenanceComponent() {
  const weakNotesQuery = useQuery(
    orpc.getWeakNotes.queryOptions({ minQualityScore: 0.55, maxResults: 50 })
  )

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
          <div className="text-[var(--sea-ink-soft)]">Loading…</div>
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
          <div className="space-y-4">
            {weakNotesQuery.data.map((note) => (
              <div
                key={note.id}
                className="p-4 rounded-xl bg-white/30 border border-[var(--line)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-bold text-[var(--sea-ink)]">{note.title}</div>
                    <div className="text-xs text-[var(--sea-ink-soft)]">{note.path}</div>
                  </div>
                  <div className="text-xs text-[var(--sea-ink-soft)]">
                    score: {note.qualityScore ?? 'n/a'}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {note.reasons.map((r: string) => (
                    <span
                      key={r}
                      className="text-xs bg-[var(--foam)] px-2.5 py-1 rounded-full border border-[var(--line)] text-[var(--lagoon-deep)]"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}

