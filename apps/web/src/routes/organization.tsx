import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  FileSearch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { orpc } from '../lib/orpc'
import {
  formatOrganizationPercentage,
  formatOrganizationSuggestionKind,
  organizationSuggestionTone,
} from '../lib/organization-suggestion-presentation'

export const Route = createFileRoute('/organization')({
  component: OrganizationReviewPage,
})

const ORGANIZATION_SUGGESTION_LIMIT = 50

function OrganizationReviewPage() {
  const suggestionsQuery = useQuery(
    orpc.listOrganizationSuggestions.queryOptions({
      input: { maxResults: ORGANIZATION_SUGGESTION_LIMIT },
    }),
  )
  const suggestions = suggestionsQuery.data ?? []

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="island-kicker mb-2">Organization review</div>
          <h1 className="display-title text-3xl text-sea-ink lg:text-4xl">A calmer way to keep the vault connected.</h1>
          <p className="mt-2 max-w-2xl text-sm text-sea-ink-soft">
            Review only the strongest signals first. Nothing is changed, linked, merged, or discarded from this page.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2 text-xs font-bold text-palm lg:self-auto">
          <ShieldCheck size={16} /> Read-only · explicit approval required
        </div>
      </header>

      <section className="feature-card island-shell mb-6 rounded-2xl p-4 lg:p-5" aria-labelledby="organization-review-boundary">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-xl bg-[rgba(79,184,178,0.16)] p-2.5 text-lagoon-deep"><ClipboardCheck size={20} /></div>
            <div>
              <h2 id="organization-review-boundary" className="font-extrabold text-sea-ink">Review suggestions, not automatic changes</h2>
              <p className="mt-1 text-xs text-sea-ink-soft">Each signal is explainable and reversible when you later choose an action in the relevant note workflow.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => suggestionsQuery.refetch()}
            disabled={suggestionsQuery.isFetching}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-[var(--surface-strong)] px-4 py-2.5 text-sm font-bold text-sea-ink hover:bg-foam disabled:opacity-60"
          >
            <RefreshCw className={suggestionsQuery.isFetching ? 'animate-spin' : ''} size={16} /> Refresh signals
          </button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="island-shell overflow-hidden rounded-2xl" aria-labelledby="suggestion-queue-heading">
          <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
            <div>
              <h2 id="suggestion-queue-heading" className="font-extrabold text-sea-ink">Review queue</h2>
              <p className="mt-1 text-xs text-sea-ink-soft">Ordered by priority, then confidence. Duplicate candidates are never merged automatically.</p>
            </div>
            {!suggestionsQuery.isLoading && !suggestionsQuery.isError && <span className="w-fit rounded-md bg-foam px-2 py-1 text-[11px] font-bold text-sea-ink-soft">{suggestions.length} {suggestions.length === 1 ? 'signal' : 'signals'}</span>}
          </div>

          {suggestionsQuery.isLoading && <LoadingQueue />}
          {suggestionsQuery.isError && <UnavailableQueue onRetry={() => suggestionsQuery.refetch()} />}
          {!suggestionsQuery.isLoading && !suggestionsQuery.isError && suggestions.length === 0 && <EmptyQueue />}
          {!suggestionsQuery.isLoading && !suggestionsQuery.isError && suggestions.length > 0 && (
            <ol className="divide-y divide-[var(--line)]">
              {suggestions.map((suggestion) => <OrganizationSuggestionCard key={suggestion.id} suggestion={suggestion} />)}
            </ol>
          )}
        </section>

        <aside className="space-y-6">
          <section className="island-shell rounded-2xl p-5" aria-labelledby="review-boundaries-heading">
            <div className="flex items-center gap-2"><ShieldCheck className="text-lagoon-deep" size={18} /><h2 id="review-boundaries-heading" className="font-extrabold text-sea-ink">Review boundaries</h2></div>
            <ul className="mt-4 space-y-3 text-xs leading-relaxed text-sea-ink-soft">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-palm" size={14} /><span>Signals use indexed metadata, not hidden note edits.</span></li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-palm" size={14} /><span>Opening a note is safe; any later change needs your confirmation.</span></li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 shrink-0 text-palm" size={14} /><span>Suggestions can be re-evaluated without changing the vault.</span></li>
            </ul>
          </section>

          <section className="island-shell rounded-2xl p-5" aria-labelledby="signal-reading-heading">
            <div className="flex items-center gap-2"><CircleDashed className="text-lagoon-deep" size={18} /><h2 id="signal-reading-heading" className="font-extrabold text-sea-ink">How to read a signal</h2></div>
            <dl className="mt-4 space-y-3 text-xs">
              <div><dt className="font-bold text-sea-ink">Priority</dt><dd className="mt-0.5 leading-relaxed text-sea-ink-soft">Which review is most useful to consider next.</dd></div>
              <div><dt className="font-bold text-sea-ink">Confidence</dt><dd className="mt-0.5 leading-relaxed text-sea-ink-soft">How strongly the available metadata supports the signal.</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  )
}

function OrganizationSuggestionCard({
  suggestion,
}: {
  suggestion: {
    id: string
    type: string
    notePath: string
    priority: number
    confidence: number
    reason: string
    actionLabel: string
    requiresApproval: true
    reversible: true
  }
}) {
  const tone = organizationSuggestionTone(suggestion.priority)

  return (
    <li className="p-4 lg:p-5">
      <article className="rounded-xl border border-transparent p-1 transition-colors hover:border-[rgba(50,143,151,0.3)] hover:bg-foam/50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={suggestionTypeClass(tone)}>{formatOrganizationSuggestionKind(suggestion.type)}</span>
              {suggestion.requiresApproval && <span className="rounded-md bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Approval required</span>}
              {suggestion.reversible && <span className="rounded-md bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Reversible</span>}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-sea-ink">{suggestion.reason}</p>
            <p className="mt-3 text-xs font-bold text-sea-ink-soft">Next review: <span className="text-sea-ink">{suggestion.actionLabel}</span></p>
            <Link
              to="/vault"
              search={{ path: suggestion.notePath, noteId: undefined, history: undefined }}
              className="mt-3 inline-flex max-w-full items-center gap-1.5 text-sm font-bold text-lagoon-deep hover:underline"
            >
              <FileSearch size={15} className="shrink-0" />
              <span className="truncate">Open {suggestion.notePath}</span>
              <ArrowUpRight size={14} className="shrink-0" />
            </Link>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-2 text-center lg:min-w-[190px]">
            <Metric label="Priority" value={formatOrganizationPercentage(suggestion.priority)} tone={tone} />
            <Metric label="Confidence" value={formatOrganizationPercentage(suggestion.confidence)} tone="neutral" />
          </dl>
        </div>
      </article>
    </li>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'high' | 'medium' | 'low' | 'neutral' }) {
  return <div className={metricClass(tone)}><dt className="text-[10px] font-bold uppercase tracking-wider">{label}</dt><dd className="mt-0.5 text-sm font-extrabold">{value}</dd></div>
}

function LoadingQueue() {
  return <div className="p-12 text-center text-sm text-sea-ink-soft"><Loader2 className="mx-auto mb-3 animate-spin" size={22} />Loading local organization signals…</div>
}

function UnavailableQueue({ onRetry }: { onRetry: () => void }) {
  return <div className="p-10 text-center"><AlertTriangle className="mx-auto mb-3 text-red-600" size={26} /><h3 className="font-extrabold text-sea-ink">Organization signals are unavailable</h3><p className="mx-auto mt-1 max-w-md text-sm text-sea-ink-soft">Confirm the local API and indexed vault are available, then try again. Your vault remains unchanged.</p><button type="button" onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-bold text-sea-ink hover:bg-foam"><RefreshCw size={15} /> Retry</button></div>
}

function EmptyQueue() {
  return <div className="p-12 text-center"><Sparkles className="mx-auto mb-3 text-lagoon-deep" size={28} /><h3 className="font-extrabold text-sea-ink">No review signals right now</h3><p className="mx-auto mt-1 max-w-md text-sm text-sea-ink-soft">This does not mean the vault is perfect. It means the current indexed metadata did not cross a review threshold.</p></div>
}

function suggestionTypeClass(tone: 'high' | 'medium' | 'low'): string {
  if (tone === 'high') return 'rounded-md bg-red-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-red-800 dark:bg-red-950/40 dark:text-red-300'
  if (tone === 'medium') return 'rounded-md bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
  return 'rounded-md bg-sky-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-sky-800 dark:bg-sky-950/40 dark:text-sky-300'
}

function metricClass(tone: 'high' | 'medium' | 'low' | 'neutral'): string {
  if (tone === 'high') return 'rounded-lg bg-red-50 px-2 py-2 text-red-800 dark:bg-red-950/30 dark:text-red-200'
  if (tone === 'medium') return 'rounded-lg bg-amber-50 px-2 py-2 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
  if (tone === 'low') return 'rounded-lg bg-sky-50 px-2 py-2 text-sky-800 dark:bg-sky-950/30 dark:text-sky-200'
  return 'rounded-lg bg-foam px-2 py-2 text-sea-ink'
}
