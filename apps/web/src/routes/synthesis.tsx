import { createFileRoute } from '@tanstack/react-router'
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
    <div className="p-8 max-w-5xl mx-auto">
      <header className="mb-12">
        <h1 className="display-title text-4xl font-bold text-[var(--sea-ink)] mb-2">Synthesis</h1>
        <p className="text-[var(--sea-ink-soft)] text-lg">Generate a wiki page by synthesizing multiple sources.</p>
      </header>

      <form onSubmit={handlePreview} className="relative mb-12">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic to synthesize (e.g. 'Gemini Enterprise Agent Platform')"
          className="w-full bg-[var(--surface-strong)] border border-[var(--line)] rounded-2xl px-6 py-5 pr-16 text-xl text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] shadow-lg transition-all"
        />
        <button
          type="submit"
          disabled={previewMutation.isPending}
          className="absolute right-3 top-3 p-3 bg-sea-ink text-white dark:text-bg-base rounded-xl hover:bg-lagoon-deep hover:text-white dark:hover:text-bg-base disabled:opacity-50 transition-colors"
        >
          {previewMutation.isPending ? <Loader2 className="animate-spin" /> : <Sparkles size={24} />}
        </button>
      </form>

      {previewMutation.isError && (
        <div className="p-4 mb-8 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600">
          <AlertCircle size={20} />
          <span>Error generating synthesis. Please try again.</span>
        </div>
      )}

      {saved && (
        <div className="p-4 mb-8 bg-[var(--foam)] border border-[var(--lagoon)] rounded-xl flex items-center gap-3 text-[var(--lagoon-deep)] shadow-sm rise-in">
          <Sparkles size={20} />
          <span className="font-medium">Knowledge successfully synthesized and saved to your vault!</span>
        </div>
      )}

      {previewData?.note && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 rise-in">
          <section className="island-shell rounded-[2rem] p-8">
            <h2 className="island-kicker mb-4 flex items-center gap-2">
              <FileText size={14} /> Proposed Note
            </h2>
            <div className="space-y-4">
              <div className="text-2xl font-bold text-[var(--sea-ink)]">{previewData.note.title}</div>
              <div className="text-sm text-[var(--sea-ink-soft)] whitespace-pre-wrap bg-white/30 p-3 rounded-lg border border-[var(--line)] max-h-[28rem] overflow-auto">
                {previewData.note.content}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-6">
            <div className="island-shell rounded-[2rem] p-8 border-dashed border-2 border-[var(--lagoon)]">
              <h2 className="island-kicker mb-4">Retrieval</h2>
              <div className="text-sm text-[var(--sea-ink-soft)]">
                Chunks: {previewData.retrieval?.chunkCount ?? 0} • Links: {previewData.retrieval?.linkCount ?? 0}
              </div>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="w-full flex items-center justify-center gap-3 py-4 bg-lagoon text-white dark:text-bg-base rounded-[1.5rem] font-bold text-lg hover:bg-lagoon-deep hover:text-white dark:hover:text-bg-base shadow-lg transition-all transform hover:-translate-y-1 active:translate-y-0 disabled:opacity-50"
            >
              {saveMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <>
                  <Save size={20} />
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

