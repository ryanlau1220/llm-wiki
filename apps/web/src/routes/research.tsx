import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  Check,
  ChevronRight,
  Clipboard,
  Copy,
  ExternalLink,
  FilePlus2,
  GitMerge,
  Inbox,
  Loader2,
  ShieldCheck,
  Trash2,
  Wifi,
} from 'lucide-react'

import { orpc } from '../lib/orpc'

export const Route = createFileRoute('/research')({
  component: ResearchInbox,
})

type InboxFilter = 'inbox' | 'approved' | 'merged' | 'discarded' | 'all'

const FILTERS: Array<{ value: InboxFilter; label: string }> = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'approved', label: 'Saved' },
  { value: 'merged', label: 'Merged' },
  { value: 'discarded', label: 'Discarded' },
  { value: 'all', label: 'All' },
]

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

function hostname(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, '') } catch { return value }
}

function ResearchInbox() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<InboxFilter>('inbox')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [mergeTargetId, setMergeTargetId] = useState('')

  const capturesQuery = useQuery(orpc.listResearchCaptures.queryOptions({ input: { status: filter } }))
  const notesQuery = useQuery(orpc.listNotes.queryOptions())
  const captures = capturesQuery.data ?? []
  const selected = useMemo(() => captures.find((capture) => capture.id === selectedId) ?? captures[0], [captures, selectedId])

  useEffect(() => {
    if (selected) {
      setSelectedId(selected.id)
      setNoteTitle(selected.sourceTitle)
    } else {
      setSelectedId(null)
      setNoteTitle('')
    }
  }, [selected?.id])

  const refreshInbox = () => {
    queryClient.invalidateQueries({ queryKey: orpc.listResearchCaptures.queryKey() })
    queryClient.invalidateQueries({ queryKey: orpc.listNotes.queryKey() })
  }

  const pairingMutation = useMutation(orpc.createExtensionPairingCode.mutationOptions({
    onSuccess: (result) => setPairing(result),
  }))
  const approveMutation = useMutation(orpc.approveResearchCapture.mutationOptions({ onSuccess: refreshInbox }))
  const mergeMutation = useMutation(orpc.mergeResearchCapture.mutationOptions({ onSuccess: refreshInbox }))
  const discardMutation = useMutation(orpc.discardResearchCapture.mutationOptions({ onSuccess: refreshInbox }))
  const isReviewing = approveMutation.isPending || mergeMutation.isPending || discardMutation.isPending

  const copyPairingCode = async () => {
    if (!pairing) return
    await navigator.clipboard.writeText(pairing.code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-6">
        <div>
          <div className="island-kicker mb-2">Local research relay</div>
          <h1 className="display-title text-3xl lg:text-4xl text-sea-ink">Research Inbox</h1>
          <p className="mt-2 text-sm text-sea-ink-soft max-w-2xl">
            Captures stay local until you review them. Approve creates a source-linked Markdown note; merge appends a backed-up research section to an existing note.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-palm bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl px-3 py-2">
          <ShieldCheck size={16} /> Explicit capture · local API · vault review
        </div>
      </header>

      <section className="island-shell feature-card rounded-2xl p-4 lg:p-5 mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3 items-start">
            <div className="shrink-0 p-2.5 rounded-xl bg-[rgba(79,184,178,0.16)] text-lagoon-deep"><Wifi size={20} /></div>
            <div>
              <h2 className="font-extrabold text-sea-ink">Connect the desktop extension</h2>
              <p className="text-xs text-sea-ink-soft mt-1">Create a one-time code, then paste it into the extension’s local setup screen.</p>
            </div>
          </div>
          {!pairing ? (
            <button type="button" onClick={() => pairingMutation.mutate(undefined)} disabled={pairingMutation.isPending}
              className="inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-xl bg-sea-ink text-white font-bold text-sm hover:bg-lagoon-deep disabled:opacity-60">
              {pairingMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Clipboard size={16} />} Generate pairing code
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-bold tracking-[0.16em] text-sea-ink bg-foam px-3 py-2.5">{pairing.code}</code>
              <button type="button" onClick={copyPairingCode} className="p-2.5 rounded-xl bg-foam border border-line text-sea-ink hover:bg-[var(--line)]" aria-label="Copy pairing code">
                {copied ? <Check size={17} className="text-palm" /> : <Copy size={17} />}
              </button>
              <span className="text-[11px] text-sea-ink-soft">Expires {formatTime(pairing.expiresAt)}</span>
              <button type="button" onClick={() => pairingMutation.mutate(undefined)} className="text-xs font-bold text-lagoon-deep hover:underline">New code</button>
            </div>
          )}
        </div>
        {pairingMutation.isError && <p className="mt-3 text-xs text-red-600">Could not create pairing code. Confirm the local API and database are running.</p>}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-5 min-h-[540px]">
        <aside className="island-shell rounded-2xl overflow-hidden flex flex-col min-h-[300px]">
          <div className="p-3 border-b border-line flex items-center justify-between">
            <div className="inline-flex p-1 bg-foam rounded-lg gap-0.5 overflow-x-auto max-w-full">
              {FILTERS.map((item) => <button key={item.value} type="button" onClick={() => setFilter(item.value)}
                className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold whitespace-nowrap ${filter === item.value ? 'bg-[var(--surface-strong)] text-sea-ink shadow-sm' : 'text-sea-ink-soft hover:text-sea-ink'}`}>{item.label}</button>)}
            </div>
          </div>
          <div className="p-2 overflow-y-auto max-h-[600px] xl:max-h-none xl:flex-1">
            {capturesQuery.isLoading && <div className="p-6 text-center text-sm text-sea-ink-soft"><Loader2 size={18} className="animate-spin mx-auto mb-2" />Loading captures…</div>}
            {capturesQuery.isError && <div className="p-5 text-sm text-red-600">Could not load the research inbox.</div>}
            {!capturesQuery.isLoading && captures.length === 0 && <div className="p-6 text-center"><Inbox className="mx-auto text-sea-ink-soft mb-3" size={26} /><p className="font-bold text-sm text-sea-ink">Nothing here yet</p><p className="mt-1 text-xs text-sea-ink-soft">Capture an answer explicitly from the browser extension.</p></div>}
            {captures.map((capture) => <button key={capture.id} type="button" onClick={() => setSelectedId(capture.id)}
              className={`w-full text-left p-3 rounded-xl mb-1 border transition-colors ${capture.id === selected?.id ? 'bg-[rgba(79,184,178,0.14)] border-[rgba(50,143,151,0.34)]' : 'border-transparent hover:bg-foam'}`}>
              <div className="flex items-start justify-between gap-2"><span className="text-sm leading-snug font-extrabold text-sea-ink line-clamp-2">{capture.sourceTitle}</span><ChevronRight size={16} className="shrink-0 mt-0.5 text-sea-ink-soft" /></div>
              <p className="mt-1 text-[11px] text-sea-ink-soft truncate">{hostname(capture.sourceUrl)}</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-sea-ink-soft">{formatTime(capture.capturedAt)}</p>
            </button>)}
          </div>
        </aside>

        <section className="island-shell rounded-2xl overflow-hidden">
          {!selected ? <div className="h-full min-h-[340px] flex items-center justify-center text-center p-8"><div><Archive size={32} className="mx-auto mb-3 text-sea-ink-soft" /><h2 className="font-extrabold text-sea-ink">Your review queue is clear</h2><p className="mt-1 text-sm text-sea-ink-soft">Approved research becomes a regular vault note with provenance.</p></div></div> : (
            <div className="p-5 lg:p-7">
              <div className="flex flex-wrap items-center gap-2 mb-4"><span className={`text-[10px] font-black tracking-wider uppercase px-2 py-1 rounded-md ${selected.status === 'inbox' ? 'bg-[rgba(79,184,178,0.17)] text-lagoon-deep' : 'bg-foam text-sea-ink-soft'}`}>{selected.status}</span><span className="text-xs text-sea-ink-soft">Captured {formatTime(selected.capturedAt)}</span></div>
              <h2 className="display-title text-2xl text-sea-ink leading-tight">{selected.sourceTitle}</h2>
              <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold"><ExternalLink size={13} />{hostname(selected.sourceUrl)}</a>
              {selected.query && <div className="mt-5 pl-4 border-l-2 border-lagoon"><div className="island-kicker mb-1">Research question</div><p className="text-sm text-sea-ink whitespace-pre-wrap">{selected.query}</p></div>}
              {selected.status === 'inbox' && selected.duplicateCandidates.length > 0 && <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"><div className="flex items-center gap-2 text-sm font-extrabold"><Archive size={16} />Already saved from this source</div><p className="mt-1 text-xs">Review the existing note before approving another capture from the same canonical URL.</p><ul className="mt-2 space-y-1 text-xs font-bold">{selected.duplicateCandidates.map((candidate) => <li key={candidate.captureId}>{candidate.path ? <a href={`/vault?path=${encodeURIComponent(candidate.path)}`} className="hover:underline">Open {candidate.title}</a> : candidate.title}</li>)}</ul></div>}
              <article className="mt-6 prose prose-sm max-w-none text-sea-ink prose-headings:text-sea-ink prose-a:text-lagoon-deep"><div className="island-kicker mb-2">Captured response</div><div className="whitespace-pre-wrap leading-7">{selected.content}</div></article>
              <div className="mt-7 pt-5 border-t border-line"><div className="island-kicker mb-2">Source trail</div><ul className="space-y-1.5 text-sm">{[{ title: selected.sourceTitle, url: selected.sourceUrl }, ...selected.sources].map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5"><ExternalLink size={13} />{source.title}</a></li>)}</ul></div>
              {selected.status === 'inbox' && <div className="mt-7 p-4 rounded-xl bg-foam border border-line space-y-3">
                <div className="flex flex-col lg:flex-row gap-2"><input value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} className="flex-1 rounded-lg border border-line bg-[var(--surface-strong)] px-3 py-2 text-sm text-sea-ink outline-none focus:border-lagoon" aria-label="New note title" />
                  <button type="button" disabled={isReviewing || !noteTitle.trim()} onClick={() => approveMutation.mutate({ id: selected.id, title: noteTitle.trim() })} className="inline-flex justify-center items-center gap-2 rounded-lg bg-lagoon text-lagoon-text px-3 py-2 text-sm font-extrabold disabled:opacity-60"><FilePlus2 size={16} />Approve as note</button></div>
                <div className="flex flex-col lg:flex-row gap-2"><select value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)} className="flex-1 rounded-lg border border-line bg-[var(--surface-strong)] px-3 py-2 text-sm text-sea-ink"><option value="">Merge into an existing note…</option>{notesQuery.data?.map((note) => <option key={note.id} value={note.id}>{note.title || note.path}</option>)}</select>
                  <button type="button" disabled={isReviewing || !mergeTargetId} onClick={() => mergeMutation.mutate({ id: selected.id, targetDocumentId: mergeTargetId })} className="inline-flex justify-center items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-extrabold text-sea-ink hover:bg-[var(--surface-strong)] disabled:opacity-60"><GitMerge size={16} />Merge</button>
                  <button type="button" disabled={isReviewing} onClick={() => { if (window.confirm('Discard this capture from the inbox?')) discardMutation.mutate({ id: selected.id }) }} className="inline-flex justify-center items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"><Trash2 size={16} />Discard</button></div>
                {(approveMutation.isError || mergeMutation.isError || discardMutation.isError) && <p className="text-xs text-red-600">The review action could not finish. The capture remains in your inbox.</p>}
              </div>}
              {selected.status !== 'inbox' && <div className="mt-6 flex items-center gap-2 text-sm font-bold text-palm"><Check size={17} />{selected.status === 'approved' ? 'Saved as a source-linked vault note.' : selected.status === 'merged' ? 'Merged into an existing vault note.' : 'Discarded from the active inbox.'}</div>}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
