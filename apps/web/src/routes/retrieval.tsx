import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DatabaseZap,
  Eye,
  FileSearch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

import { orpc } from '../lib/orpc'
import {
  formatRetrievalTraceDuration,
  formatRetrievalTracePolicy,
  formatRetrievalTraceStatus,
  formatRetrievalTraceTime,
  RETRIEVAL_RETENTION_DAY_OPTIONS,
  RETRIEVAL_RETENTION_LIMIT_OPTIONS,
  RETRIEVAL_TRACE_PAGE_SIZE,
} from '../lib/retrieval-trace'

export const Route = createFileRoute('/retrieval')({
  component: RetrievalTraceDashboard,
})

type TraceCursor = string | null

const INITIAL_RETENTION_DAYS = 30
const INITIAL_RETENTION_LIMIT = 100

function RetrievalTraceDashboard() {
  const queryClient = useQueryClient()
  const [cursor, setCursor] = useState<TraceCursor>(null)
  const [cursorHistory, setCursorHistory] = useState<TraceCursor[]>([])
  const [isEvidenceVisible, setIsEvidenceVisible] = useState(false)
  const [retentionDays, setRetentionDays] = useState(INITIAL_RETENTION_DAYS)
  const [retentionLimit, setRetentionLimit] = useState(INITIAL_RETENTION_LIMIT)
  const [isRetentionConfirming, setIsRetentionConfirming] = useState(false)
  const [retentionMessage, setRetentionMessage] = useState<string | null>(null)

  const tracesQuery = useQuery(
    orpc.listRetrievalTraces.queryOptions({
      input: {
        limit: RETRIEVAL_TRACE_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
        includeEvidence: isEvidenceVisible,
      },
    }),
  )

  const pruneMutation = useMutation(
    orpc.pruneRetrievalTraces.mutationOptions({
      onSuccess: (result) => {
        setRetentionMessage(`Removed ${result.deletedCount} trace ${result.deletedCount === 1 ? 'run' : 'runs'} older than ${retentionDays} days.`)
        setIsRetentionConfirming(false)
        setCursor(null)
        setCursorHistory([])
        queryClient.invalidateQueries({ queryKey: orpc.listRetrievalTraces.queryKey() })
      },
      onError: () => setRetentionMessage('Retention cleanup could not finish. No result was confirmed.'),
    }),
  )

  const traces = tracesQuery.data?.items ?? []
  const isFirstPage = cursor === null
  const selectedEvidenceCount = useMemo(
    () => traces.reduce((count, trace) => count + (trace.evidence?.length ?? 0), 0),
    [traces],
  )

  const revealEvidence = () => {
    setIsEvidenceVisible(true)
  }

  const goToNextPage = () => {
    const nextCursor = tracesQuery.data?.nextCursor
    if (!nextCursor) return
    setCursorHistory((history) => [...history, cursor])
    setCursor(nextCursor)
  }

  const goToPreviousPage = () => {
    const previousCursor = cursorHistory.at(-1)
    if (previousCursor === undefined) return
    setCursorHistory((history) => history.slice(0, -1))
    setCursor(previousCursor)
  }

  const refreshTraces = () => {
    setRetentionMessage(null)
    tracesQuery.refetch()
  }

  const confirmRetention = () => {
    setRetentionMessage(null)
    pruneMutation.mutate({ olderThanDays: retentionDays, limit: retentionLimit })
  }

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-6">
        <div>
          <div className="island-kicker mb-2">Operational visibility</div>
          <h1 className="display-title text-3xl lg:text-4xl text-sea-ink">Retrieval traces</h1>
          <p className="mt-2 text-sm text-sea-ink-soft max-w-2xl">
            Review bounded retrieval decisions without exposing the question, query hash, or packed context.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs font-bold text-palm bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl px-3 py-2">
          <ShieldCheck size={16} /> Metadata first · evidence on demand
        </div>
      </header>

      <section className="island-shell feature-card rounded-2xl p-4 lg:p-5 mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-3 items-start">
            <div className="shrink-0 p-2.5 rounded-xl bg-[rgba(79,184,178,0.16)] text-lagoon-deep"><DatabaseZap size={20} /></div>
            <div>
              <h2 className="font-extrabold text-sea-ink">Safe trace inspection</h2>
              <p className="text-xs text-sea-ink-soft mt-1">
                This page shows execution metadata. Source paths and ranks are fetched only when you explicitly inspect evidence.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isEvidenceVisible ? (
              <button type="button" onClick={revealEvidence} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sea-ink text-white font-bold text-sm hover:bg-lagoon-deep">
                <Eye size={16} /> Inspect evidence
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[rgba(79,184,178,0.16)] text-lagoon-deep font-bold text-sm">
                <Eye size={16} /> Evidence visible for this page
              </span>
            )}
            <button type="button" onClick={refreshTraces} disabled={tracesQuery.isFetching} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--surface-strong)] border border-line text-sea-ink font-bold text-sm hover:bg-foam disabled:opacity-60">
              <RefreshCw className={tracesQuery.isFetching ? 'animate-spin' : ''} size={16} /> Refresh
            </button>
          </div>
        </div>
        {isEvidenceVisible && <p className="mt-4 text-xs text-sea-ink-soft">Visible evidence references: {selectedEvidenceCount}. They contain document paths and ranking metadata only.</p>}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="island-shell rounded-2xl overflow-hidden">
          <div className="p-4 lg:p-5 border-b border-line flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-extrabold text-sea-ink">Recent runs</h2>
              <p className="mt-1 text-xs text-sea-ink-soft">Newest first · {RETRIEVAL_TRACE_PAGE_SIZE} runs per page</p>
            </div>
            {!isFirstPage && <span className="text-xs font-bold text-sea-ink-soft">Older page</span>}
          </div>

          {tracesQuery.isLoading && <div className="p-12 text-center text-sm text-sea-ink-soft"><Loader2 className="animate-spin mx-auto mb-3" size={22} />Loading local trace metadata…</div>}
          {tracesQuery.isError && <div className="p-8 text-center"><AlertTriangle className="mx-auto mb-3 text-red-600" size={26} /><h3 className="font-extrabold text-sea-ink">Trace history is unavailable</h3><p className="mt-1 text-sm text-sea-ink-soft">Confirm the local API and database are running, then refresh this page.</p></div>}
          {!tracesQuery.isLoading && !tracesQuery.isError && traces.length === 0 && <div className="p-12 text-center"><FileSearch className="mx-auto mb-3 text-sea-ink-soft" size={28} /><h3 className="font-extrabold text-sea-ink">No retrieval runs yet</h3><p className="mt-1 text-sm text-sea-ink-soft">Ask a vault question or run a synthesis to create a local trace.</p></div>}
          {!tracesQuery.isLoading && !tracesQuery.isError && traces.length > 0 && <ol className="divide-y divide-[var(--line)]">
            {traces.map((trace) => (
              <li key={trace.id} className="p-4 lg:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={statusClass(trace.status)}>{formatRetrievalTraceStatus(trace.status)}</span>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-sea-ink-soft">{trace.operation}</span>
                      <span className="text-[11px] font-bold text-sea-ink-soft">{formatRetrievalTraceTime(trace.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm font-extrabold text-sea-ink">{formatRetrievalTracePolicy(trace.policy)}</p>
                    <p className="mt-1 text-xs text-sea-ink-soft">{trace.policyReason}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[250px]">
                    <TraceMetric label="Duration" value={formatRetrievalTraceDuration(trace.durationMs)} />
                    <TraceMetric label="Candidates" value={String(trace.candidateCount)} />
                    <TraceMetric label="Evidence" value={String(trace.selectedEvidenceCount)} />
                  </div>
                </div>
                {isEvidenceVisible && <TraceEvidence evidence={trace.evidence ?? []} />}
              </li>
            ))}
          </ol>}

          <div className="p-4 border-t border-line flex items-center justify-between gap-3">
            <button type="button" onClick={goToPreviousPage} disabled={cursorHistory.length === 0 || tracesQuery.isFetching} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line text-sm font-bold text-sea-ink hover:bg-foam disabled:opacity-50">
              <ChevronLeft size={16} /> Newer
            </button>
            <span className="text-xs text-sea-ink-soft">{tracesQuery.isFetching ? 'Updating…' : isFirstPage ? 'Latest page' : 'Older trace page'}</span>
            <button type="button" onClick={goToNextPage} disabled={!tracesQuery.data?.nextCursor || tracesQuery.isFetching} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line text-sm font-bold text-sea-ink hover:bg-foam disabled:opacity-50">
              Older <ChevronRight size={16} />
            </button>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="island-shell rounded-2xl p-5">
            <div className="flex items-center gap-2"><Clock3 size={18} className="text-lagoon-deep" /><h2 className="font-extrabold text-sea-ink">Trace retention</h2></div>
            <p className="mt-2 text-xs leading-relaxed text-sea-ink-soft">Remove only a bounded number of older local trace runs. This cannot be undone.</p>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-bold text-sea-ink-soft" htmlFor="trace-retention-days">Older than</label>
              <select id="trace-retention-days" value={retentionDays} onChange={(event) => { setRetentionDays(Number(event.target.value)); setIsRetentionConfirming(false) }} className="w-full rounded-lg border border-line bg-[var(--surface-strong)] px-3 py-2 text-sm text-sea-ink">
                {RETRIEVAL_RETENTION_DAY_OPTIONS.map((days) => <option key={days} value={days}>{days} days</option>)}
              </select>
              <label className="block text-xs font-bold text-sea-ink-soft" htmlFor="trace-retention-limit">Maximum runs</label>
              <select id="trace-retention-limit" value={retentionLimit} onChange={(event) => { setRetentionLimit(Number(event.target.value)); setIsRetentionConfirming(false) }} className="w-full rounded-lg border border-line bg-[var(--surface-strong)] px-3 py-2 text-sm text-sea-ink">
                {RETRIEVAL_RETENTION_LIMIT_OPTIONS.map((limit) => <option key={limit} value={limit}>{limit} runs</option>)}
              </select>
            </div>
            {!isRetentionConfirming ? (
              <button type="button" onClick={() => { setRetentionMessage(null); setIsRetentionConfirming(true) }} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2.5 text-sm font-extrabold text-red-700 hover:bg-red-50">
                <Trash2 size={16} /> Review cleanup
              </button>
            ) : (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-bold leading-relaxed text-red-900">Delete up to {retentionLimit} trace runs older than {retentionDays} days? This only removes local trace metadata and evidence references.</p>
                <div className="mt-3 flex gap-2"><button type="button" onClick={confirmRetention} disabled={pruneMutation.isPending} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-sm font-extrabold text-white hover:bg-red-800 disabled:opacity-60">{pruneMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />} Delete traces</button><button type="button" onClick={() => setIsRetentionConfirming(false)} disabled={pruneMutation.isPending} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-800 hover:bg-white disabled:opacity-60">Cancel</button></div>
              </div>
            )}
            {retentionMessage && <p className={`mt-3 text-xs font-bold ${pruneMutation.isError ? 'text-red-700' : 'text-palm'}`} role="status">{retentionMessage}</p>}
          </section>

          <section className="island-shell rounded-2xl p-5">
            <h2 className="font-extrabold text-sea-ink">What is not shown</h2>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-sea-ink-soft">
              <li>Questions and query hashes</li>
              <li>Packed source context</li>
              <li>Generated model output</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

function TraceMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-foam px-2 py-2"><span className="block text-[10px] font-bold uppercase tracking-wider text-sea-ink-soft">{label}</span><span className="mt-0.5 block text-sm font-extrabold text-sea-ink">{value}</span></div>
}

function TraceEvidence({ evidence }: { evidence: Array<{ documentId: string; documentPath: string; chunkIndex: number; source: string; score: number; retrievalRank: number; selectionRank: number | null }> }) {
  if (evidence.length === 0) return <p className="mt-4 text-xs text-sea-ink-soft">No evidence was selected for this run.</p>
  return <div className="mt-4 rounded-xl border border-line bg-foam p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-sea-ink-soft">Evidence references</p><ul className="mt-2 space-y-2">{evidence.map((item) => <li key={`${item.documentId}-${item.chunkIndex}`} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="break-all font-bold text-sea-ink">{item.documentPath} · chunk {item.chunkIndex + 1}</span><span className="text-sea-ink-soft">{item.source} · rank {item.retrievalRank}{item.selectionRank ? ` · selected ${item.selectionRank}` : ''}</span></li>)}</ul></div>
}

function statusClass(status: 'started' | 'succeeded' | 'failed'): string {
  if (status === 'succeeded') return 'rounded-md bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (status === 'failed') return 'rounded-md bg-red-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-red-800 dark:bg-red-950/40 dark:text-red-300'
  return 'rounded-md bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
}
