import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { orpc } from '../lib/orpc'
import { useMutation } from '@tanstack/react-query'
import { 
  Send, 
  Loader2, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Link as LinkIcon,
  Tag as TagIcon
} from 'lucide-react'

export const Route = createFileRoute('/ask')({
  component: AskComponent,
})

function AskComponent() {
  const [query, setQuery] = useState('')
  const [previewData, setPreviewData] = useState<any>(null)
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  
  const askMutation = useMutation(
    orpc.askPreview.mutationOptions({
      onSuccess: (data) => {
        setPreviewData(data)
        setSaveStatus(null)
      }
    })
  )

  const saveMutation = useMutation(
    orpc.confirmAskSave.mutationOptions({
      onSuccess: (data) => {
        if (data.status === 'rejected') {
          setSaveStatus({ type: 'error', message: `Save rejected: ${data.error?.replace(/_/g, ' ')}` })
        } else {
          setSaveStatus({ type: 'success', message: 'Note successfully saved to vault!' })
          setPreviewData(null)
          setQuery('')
        }
      }
    })
  )

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    askMutation.mutate({ query })
  }

  const handleSave = () => {
    if (!previewData) return
    saveMutation.mutate({
      requestId: previewData.requestId,
      note: previewData.note
    })
  }

  return (
    <div className="p-5 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)] mb-1">Ask Knowledge</h1>
        <p className="text-[var(--sea-ink-soft)] text-base">Query your wiki and generate new structured notes.</p>
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

      <form onSubmit={handleAsk} className="relative mb-8">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you want to know?"
          className="w-full bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl px-5 py-4 pr-14 text-lg text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] shadow-sm transition-all"
        />
        <button
          type="submit"
          disabled={askMutation.isPending}
          className="absolute right-2.5 top-2.5 p-2.5 bg-sea-ink text-bg-base rounded-lg hover:bg-lagoon-deep hover:text-bg-base disabled:opacity-50 transition-colors cursor-pointer"
        >
          {askMutation.isPending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
        </button>
      </form>

      {askMutation.isError && (
        <div className="p-4 mb-6 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600">
          <AlertCircle size={20} />
          <span>Error generating answer. Please try again.</span>
        </div>
      )}

      {previewData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 rise-in">
          {/* Answer Area */}
          <section className="island-shell rounded-xl p-5 bg-white/40">
            <h2 className="island-kicker mb-3 flex items-center gap-2">
              <CheckCircle2 size={12} /> AI Answer
            </h2>
            <div className="prose prose-slate max-w-none text-sm text-[var(--sea-ink)] leading-relaxed whitespace-pre-wrap">
              {previewData.answer}
            </div>
          </section>

          {/* Note Preview Area */}
          <section className="flex flex-col gap-5">
            <div className="island-shell rounded-xl p-5 flex-1 border border-[var(--lagoon)] bg-white/50 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-2.5 bg-[var(--lagoon)] text-white text-[9px] font-bold uppercase tracking-widest rounded-tr-xl rounded-bl-lg">
                Draft Note
              </div>
              
              <h2 className="island-kicker mb-4 flex items-center gap-2">
                <FileText size={12} /> Proposed Note
              </h2>

              <div className="space-y-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1">Title</span>
                  <div className="text-xl font-bold text-[var(--sea-ink)]">{previewData.note.title}</div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1">Content</span>
                  <div className="text-xs text-[var(--sea-ink-soft)] line-clamp-[10] bg-white/30 p-3 rounded-lg border border-[var(--line)] font-mono whitespace-pre-wrap">
                    {previewData.note.content}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {previewData.note.links?.length > 0 && (
                    <div className="flex items-center gap-1 text-[10px] bg-[var(--foam)] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--lagoon-deep)] font-medium">
                      <LinkIcon size={10} /> {previewData.note.links.length} Links
                    </div>
                  )}
                  {previewData.note.tags?.length > 0 && (
                    <div className="flex items-center gap-1 text-[10px] bg-[var(--foam)] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--palm)] font-medium">
                      <TagIcon size={10} /> {previewData.note.tags.length} Tags
                    </div>
                  )}
                </div>

                {previewData.sources?.length > 0 && (
                  <div className="border-t border-[var(--line)] pt-3.5 mt-2">
                    <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1.5">Referred Sources</span>
                    <div className="flex flex-wrap gap-1.5">
                      {previewData.sources.map((src: any) => (
                        <Link
                          key={src.id}
                          to="/vault"
                          search={{ path: src.path }}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] bg-[var(--foam)] px-2.5 py-1 rounded-full border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--line)] hover:text-[var(--lagoon-deep)] transition-all font-medium"
                        >
                          <FileText size={10} /> {src.title || src.path.split('/').pop()}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-3 bg-lagoon text-lagoon-text rounded-lg font-bold text-base hover:bg-lagoon-deep hover:text-lagoon-text shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {saveMutation.isPending ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <Save size={16} />
                  Save to Wiki
                </>
              )}
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
