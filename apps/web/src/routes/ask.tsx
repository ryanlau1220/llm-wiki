import { createFileRoute } from '@tanstack/react-router'
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
  
  const askMutation = useMutation(
    orpc.askPreview.mutationOptions({
      onSuccess: (data) => {
        setPreviewData(data)
      }
    })
  )

  const saveMutation = useMutation(
    orpc.confirmAskSave.mutationOptions({
      onSuccess: () => {
        setPreviewData(null)
        setQuery('')
        // Could add a toast here
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
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-12">
        <h1 className="display-title text-4xl font-bold text-[var(--sea-ink)] mb-2">Ask Knowledge</h1>
        <p className="text-[var(--sea-ink-soft)] text-lg">Query your wiki and generate new structured notes.</p>
      </header>

      <form onSubmit={handleAsk} className="relative mb-12">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you want to know?"
          className="w-full bg-[var(--surface-strong)] border border-[var(--line)] rounded-2xl px-6 py-5 pr-16 text-xl text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] shadow-lg transition-all"
        />
        <button
          type="submit"
          disabled={askMutation.isPending}
          className="absolute right-3 top-3 p-3 bg-[var(--sea-ink)] text-white rounded-xl hover:bg-[var(--lagoon-deep)] disabled:opacity-50 transition-colors"
        >
          {askMutation.isPending ? <Loader2 className="animate-spin" /> : <Send size={24} />}
        </button>
      </form>

      {askMutation.isError && (
        <div className="p-4 mb-8 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600">
          <AlertCircle size={20} />
          <span>Error generating answer. Please try again.</span>
        </div>
      )}

      {previewData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 rise-in">
          {/* Answer Area */}
          <section className="island-shell rounded-[2rem] p-8">
            <h2 className="island-kicker mb-4 flex items-center gap-2">
              <CheckCircle2 size={14} /> AI Answer
            </h2>
            <div className="prose prose-slate max-w-none text-[var(--sea-ink)] leading-relaxed">
              {previewData.answer}
            </div>
          </section>

          {/* Note Preview Area */}
          <section className="flex flex-col gap-6">
            <div className="island-shell rounded-[2rem] p-8 flex-1 border-dashed border-2 border-[var(--lagoon)] relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 bg-[var(--lagoon)] text-white text-xs font-bold uppercase tracking-widest rounded-bl-xl">
                Draft Note
              </div>
              
              <h2 className="island-kicker mb-6 flex items-center gap-2">
                <FileText size={14} /> Proposed Note
              </h2>

              <div className="space-y-6">
                <div>
                  <span className="text-xs uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1">Title</span>
                  <div className="text-2xl font-bold text-[var(--sea-ink)]">{previewData.note.title}</div>
                </div>

                <div>
                  <span className="text-xs uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1">Content</span>
                  <div className="text-sm text-[var(--sea-ink-soft)] line-clamp-[10] bg-white/30 p-3 rounded-lg border border-[var(--line)]">
                    {previewData.note.content}
                  </div>
                </div>

                <div className="flex flex-wrap gap-4">
                  {previewData.note.links?.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs bg-[var(--foam)] px-2.5 py-1 rounded-full border border-[var(--line)] text-[var(--lagoon-deep)]">
                      <LinkIcon size={12} /> {previewData.note.links.length} Links
                    </div>
                  )}
                  {previewData.note.tags?.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs bg-[var(--foam)] px-2.5 py-1 rounded-full border border-[var(--line)] text-[var(--palm)]">
                      <TagIcon size={12} /> {previewData.note.tags.length} Tags
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="w-full flex items-center justify-center gap-3 py-4 bg-[var(--lagoon)] text-white rounded-[1.5rem] font-bold text-lg hover:bg-[var(--lagoon-deep)] shadow-lg transition-all transform hover:-translate-y-1 active:translate-y-0 disabled:opacity-50"
            >
              {saveMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <Save size={20} />
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
