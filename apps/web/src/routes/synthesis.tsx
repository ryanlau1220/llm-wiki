import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { orpc } from '../lib/orpc'
import { Loader2, Save, Sparkles, AlertCircle, FileText } from 'lucide-react'

export const Route = createFileRoute('/synthesis')({
  component: SynthesisComponent,
})

function SynthesisComponent() {
  const [topic, setTopic] = useState('')
  const [previewData, setPreviewData] = useState<any>(null)
  const [saved, setSaved] = useState(false)

  const previewMutation = useMutation(
    orpc.synthesisPreview.mutationOptions({
      onSuccess: (data) => {
        setPreviewData(data)
        setSaved(false)
      },
    })
  )

  const saveMutation = useMutation(
    orpc.confirmSynthesisSave.mutationOptions({
      onSuccess: () => {
        setPreviewData(null)
        setTopic('')
        setSaved(true)
      },
    })
  )

  const handlePreview = (e: React.FormEvent) => {
    e.preventDefault()
    if (!topic.trim()) return
    previewMutation.mutate({ topic })
  }

  const handleSave = () => {
    if (!previewData?.note) return
    saveMutation.mutate({ requestId: previewData.requestId, note: previewData.note })
  }

  return (
    <div className="p-5 max-w-5xl mx-auto">
      <header className="mb-8">
        <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)] mb-1">Synthesis</h1>
        <p className="text-[var(--sea-ink-soft)] text-base">Generate a wiki page by synthesizing multiple sources.</p>
      </header>

      <form onSubmit={handlePreview} className="relative mb-8">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic to synthesize (e.g. 'Gemini Enterprise Agent Platform')"
          className="w-full bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl px-5 py-4 pr-14 text-lg text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] shadow-sm transition-all"
        />
        <button
          type="submit"
          disabled={previewMutation.isPending}
          className="absolute right-2.5 top-2.5 p-2.5 bg-sea-ink text-bg-base rounded-lg hover:bg-lagoon-deep hover:text-bg-base disabled:opacity-50 transition-colors cursor-pointer"
        >
          {previewMutation.isPending ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
        </button>
      </form>

      {previewMutation.isError && (
        <div className="p-4 mb-6 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600">
          <AlertCircle size={20} />
          <span>Error generating synthesis. Please try again.</span>
        </div>
      )}

      {saved && (
        <div className="p-4 mb-6 bg-[var(--foam)] border border-[var(--lagoon)] rounded-xl flex items-center gap-3 text-[var(--lagoon-deep)] shadow-sm rise-in">
          <Sparkles size={20} />
          <span className="font-medium">Knowledge successfully synthesized and saved to your vault!</span>
        </div>
      )}

      {previewData?.note && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 rise-in">
          <section className="island-shell rounded-xl p-5 bg-white/40">
            <h2 className="island-kicker mb-3 flex items-center gap-2">
              <FileText size={12} /> Proposed Note
            </h2>
            <div className="space-y-3">
              <div className="text-xl font-bold text-[var(--sea-ink)]">{previewData.note.title}</div>
              <div className="text-xs text-[var(--sea-ink-soft)] whitespace-pre-wrap bg-white/30 p-3 rounded-lg border border-[var(--line)] max-h-[24rem] overflow-auto font-mono">
                {previewData.note.content}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-5">
            <div className="island-shell rounded-xl p-5 border border-[var(--lagoon)] bg-white/40">
              <h2 className="island-kicker mb-3">Retrieval</h2>
              <div className="text-xs text-[var(--sea-ink-soft)]">
                Chunks: {previewData.retrieval?.chunkCount ?? 0} • Links: {previewData.retrieval?.linkCount ?? 0}
              </div>
              {previewData.sources?.length > 0 && (
                <div className="border-t border-[var(--line)] pt-3.5 mt-3">
                  <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-2">Referred Sources</span>
                  <div className="flex flex-wrap gap-1.5">
                    {previewData.sources.map((src: any) => (
                      <Link
                        key={src.id}
                        to="/vault"
                        search={{ path: src.path }}
                        className="inline-flex items-center gap-1 text-[10px] bg-[var(--foam)] px-2.5 py-1 rounded-full border border-[var(--line)] text-[var(--sea-ink)] hover:bg-[var(--line)] hover:text-[var(--lagoon-deep)] transition-all font-medium"
                      >
                        <FileText size={10} className="shrink-0" /> {src.title || src.path.split('/').pop()}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
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
                  Save Synthesized Note
                </>
              )}
            </button>
          </section>
        </div>
      )}
    </div>
  )
}
