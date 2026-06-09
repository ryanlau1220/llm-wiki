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
  Tag as TagIcon,
  Sparkles
} from 'lucide-react'

export const Route = createFileRoute('/generator')({
  component: GeneratorComponent,
})

function GeneratorComponent() {
  const [activeTab, setActiveTab] = useState<'ask' | 'synthesis'>('ask')
  
  // Q&A (Ask) state
  const [query, setQuery] = useState('')
  const [askPreviewData, setAskPreviewData] = useState<any>(null)
  const [askSaveStatus, setAskSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  // Synthesis state
  const [topic, setTopic] = useState('')
  const [synthesisPreviewData, setSynthesisPreviewData] = useState<any>(null)
  const [synthesisSaveStatus, setSynthesisSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  const askMutation = useMutation(
    orpc.askPreview.mutationOptions({
      onSuccess: (data) => {
        setAskPreviewData(data)
        setAskSaveStatus(null)
      }
    })
  )

  const askSaveMutation = useMutation(
    orpc.confirmAskSave.mutationOptions({
      onSuccess: (data) => {
        if (data.status === 'rejected') {
          setAskSaveStatus({ type: 'error', message: `Save rejected: ${data.error?.replace(/_/g, ' ')}` })
        } else {
          setAskSaveStatus({ type: 'success', message: 'Note successfully saved to vault!' })
          setAskPreviewData(null)
          setQuery('')
        }
      }
    })
  )

  const synthesisMutation = useMutation(
    orpc.synthesisPreview.mutationOptions({
      onSuccess: (data) => {
        setSynthesisPreviewData(data)
        setSynthesisSaveStatus(null)
      }
    })
  )

  const synthesisSaveMutation = useMutation(
    orpc.confirmSynthesisSave.mutationOptions({
      onSuccess: (data) => {
        if (data.status === 'rejected') {
          setSynthesisSaveStatus({ type: 'error', message: `Save rejected: ${data.error?.replace(/_/g, ' ')}` })
        } else {
          setSynthesisSaveStatus({ type: 'success', message: 'Knowledge successfully synthesized and saved to your vault!' })
          setSynthesisPreviewData(null)
          setTopic('')
        }
      }
    })
  )

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    askMutation.mutate({ query })
  }

  const handleAskSave = () => {
    if (!askPreviewData) return
    askSaveMutation.mutate({
      requestId: askPreviewData.requestId,
      note: askPreviewData.note
    })
  }

  const handleSynthesis = (e: React.FormEvent) => {
    e.preventDefault()
    if (!topic.trim()) return
    synthesisMutation.mutate({ topic })
  }

  const handleSynthesisSave = () => {
    if (!synthesisPreviewData?.note) return
    synthesisSaveMutation.mutate({
      requestId: synthesisPreviewData.requestId,
      note: synthesisPreviewData.note
    })
  }

  return (
    <div className="p-5 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)] mb-1">AI Generator</h1>
        <p className="text-[var(--sea-ink-soft)] text-base">Generate fresh knowledge using Q&A or topic synthesis.</p>
      </header>

      {/* Tabs Switcher */}
      <div className="flex bg-[var(--foam)] p-1 rounded-xl max-w-md mb-8 border border-[var(--line)]">
        <button
          type="button"
          onClick={() => setActiveTab('ask')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === 'ask'
              ? 'bg-white text-[var(--sea-ink)] shadow-sm border border-[var(--line)]'
              : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
          }`}
        >
          <Send size={14} />
          Ask Q&A
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('synthesis')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            activeTab === 'synthesis'
              ? 'bg-white text-[var(--sea-ink)] shadow-sm border border-[var(--line)]'
              : 'text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]'
          }`}
        >
          <Sparkles size={14} />
          Topic Synthesis
        </button>
      </div>

      {activeTab === 'ask' ? (
        <div className="rise-in">
          {askSaveStatus && (
            <div className={`p-4 mb-6 border rounded-xl flex items-center gap-3 ${
              askSaveStatus.type === 'success' 
                ? 'bg-green-50 border-green-100 text-green-700' 
                : 'bg-amber-50 border-amber-100 text-amber-700'
            }`}>
              {askSaveStatus.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-medium">{askSaveStatus.message}</span>
            </div>
          )}

          <form onSubmit={handleAsk} className="relative mb-8">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about your wiki content..."
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

          {askPreviewData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 rise-in">
              <section className="island-shell rounded-xl p-5 bg-white/40">
                <h2 className="island-kicker mb-3 flex items-center gap-2">
                  <CheckCircle2 size={12} /> AI Answer
                </h2>
                <div className="prose prose-slate max-w-none text-sm text-[var(--sea-ink)] leading-relaxed whitespace-pre-wrap">
                  {askPreviewData.answer}
                </div>
              </section>

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
                      <div className="text-xl font-bold text-[var(--sea-ink)]">{askPreviewData.note.title}</div>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1">Content</span>
                      <div className="text-xs text-[var(--sea-ink-soft)] line-clamp-[10] bg-white/30 p-3 rounded-lg border border-[var(--line)] font-mono whitespace-pre-wrap overflow-y-auto max-h-[16rem]">
                        {askPreviewData.note.content}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {askPreviewData.note.links?.length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] bg-[var(--foam)] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--lagoon-deep)] font-medium">
                          <LinkIcon size={10} /> {askPreviewData.note.links.length} Links
                        </div>
                      )}
                      {askPreviewData.note.tags?.length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] bg-[var(--foam)] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--palm)] font-medium">
                          <TagIcon size={10} /> {askPreviewData.note.tags.length} Tags
                        </div>
                      )}
                    </div>

                    {askPreviewData.sources?.length > 0 && (
                      <div className="border-t border-[var(--line)] pt-3.5 mt-2">
                        <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1.5">Referred Sources</span>
                        <div className="flex flex-wrap gap-1.5">
                          {askPreviewData.sources.map((src: any) => (
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
                  onClick={handleAskSave}
                  disabled={askSaveMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-lagoon text-lagoon-text rounded-lg font-bold text-base hover:bg-lagoon-deep hover:text-lagoon-text shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {askSaveMutation.isPending ? (
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
      ) : (
        <div className="rise-in">
          {synthesisSaveStatus && (
            <div className={`p-4 mb-6 border rounded-xl flex items-center gap-3 ${
              synthesisSaveStatus.type === 'success' 
                ? 'bg-green-50 border-green-100 text-green-700' 
                : 'bg-amber-50 border-amber-100 text-amber-700'
            }`}>
              {synthesisSaveStatus.type === 'success' ? <Sparkles size={20} /> : <AlertCircle size={20} />}
              <span className="text-sm font-medium">{synthesisSaveStatus.message}</span>
            </div>
          )}

          <form onSubmit={handleSynthesis} className="relative mb-8">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic to synthesize (e.g. 'Drizzle ORM Integration')"
              className="w-full bg-[var(--surface-strong)] border border-[var(--line)] rounded-xl px-5 py-4 pr-14 text-lg text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] shadow-sm transition-all"
            />
            <button
              type="submit"
              disabled={synthesisMutation.isPending}
              className="absolute right-2.5 top-2.5 p-2.5 bg-sea-ink text-bg-base rounded-lg hover:bg-lagoon-deep hover:text-bg-base disabled:opacity-50 transition-colors cursor-pointer"
            >
              {synthesisMutation.isPending ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
            </button>
          </form>

          {synthesisMutation.isError && (
            <div className="p-4 mb-6 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3 text-red-600">
              <AlertCircle size={20} />
              <span>Error generating synthesis. Please try again.</span>
            </div>
          )}

          {synthesisPreviewData?.note && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 rise-in">
              <section className="island-shell rounded-xl p-5 bg-white/40">
                <h2 className="island-kicker mb-3 flex items-center gap-2">
                  <FileText size={12} /> Proposed Note
                </h2>
                <div className="space-y-3">
                  <div className="text-xl font-bold text-[var(--sea-ink)]">{synthesisPreviewData.note.title}</div>
                  <div className="text-xs text-[var(--sea-ink-soft)] whitespace-pre-wrap bg-white/30 p-3 rounded-lg border border-[var(--line)] max-h-[24rem] overflow-auto font-mono">
                    {synthesisPreviewData.note.content}
                  </div>
                </div>
              </section>

              <section className="flex flex-col gap-5">
                <div className="island-shell rounded-xl p-5 border border-[var(--lagoon)] bg-white/40">
                  <h2 className="island-kicker mb-3">Retrieval</h2>
                  <div className="text-xs text-[var(--sea-ink-soft)] mb-3 font-semibold">
                    Chunks Analyzed: {synthesisPreviewData.retrieval?.chunkCount ?? 0} • Links Checked: {synthesisPreviewData.retrieval?.linkCount ?? 0}
                  </div>
                  {synthesisPreviewData.sources?.length > 0 && (
                    <div className="border-t border-[var(--line)] pt-3.5">
                      <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-2">Referred Sources</span>
                      <div className="flex flex-wrap gap-1.5">
                        {synthesisPreviewData.sources.map((src: any) => (
                          <Link
                            key={src.id}
                            to="/vault"
                            search={{ path: src.path }}
                            target="_blank"
                            rel="noopener noreferrer"
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
                  onClick={handleSynthesisSave}
                  disabled={synthesisSaveMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-lagoon text-lagoon-text rounded-lg font-bold text-base hover:bg-lagoon-deep hover:text-lagoon-text shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  {synthesisSaveMutation.isPending ? (
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
      )}
    </div>
  )
}
