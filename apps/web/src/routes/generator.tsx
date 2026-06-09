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
  ChevronRight
} from 'lucide-react'

export const Route = createFileRoute('/generator')({
  component: GeneratorComponent,
})

function GeneratorComponent() {
  const [activeMode, setActiveMode] = useState<'rag' | 'general' | 'synthesis'>('rag')
  const [queryText, setQueryText] = useState('')
  const [result, setResult] = useState<{
    mode: 'rag' | 'general' | 'synthesis';
    query: string;
    data: any;
  } | null>(null)
  
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  const askMutation = useMutation(
    orpc.askPreview.mutationOptions({
      onSuccess: (data) => {
        setResult({
          mode: activeMode, // 'rag' or 'general'
          query: queryText,
          data
        })
        setSaveStatus(null)
      }
    })
  )

  const askSaveMutation = useMutation(
    orpc.confirmAskSave.mutationOptions({
      onSuccess: (data) => {
        if (data.status === 'rejected') {
          setSaveStatus({ type: 'error', message: `Save rejected: ${data.error?.replace(/_/g, ' ')}` })
        } else {
          setSaveStatus({ type: 'success', message: 'Note successfully saved to vault!' })
          setResult(null)
          setQueryText('')
        }
      }
    })
  )

  const synthesisMutation = useMutation(
    orpc.synthesisPreview.mutationOptions({
      onSuccess: (data) => {
        setResult({
          mode: 'synthesis',
          query: queryText,
          data
        })
        setSaveStatus(null)
      }
    })
  )

  const synthesisSaveMutation = useMutation(
    orpc.confirmSynthesisSave.mutationOptions({
      onSuccess: (data) => {
        if (data.status === 'rejected') {
          setSaveStatus({ type: 'error', message: `Save rejected: ${data.error?.replace(/_/g, ' ')}` })
        } else {
          setSaveStatus({ type: 'success', message: 'Knowledge successfully synthesized and saved to your vault!' })
          setResult(null)
          setQueryText('')
        }
      }
    })
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!queryText.trim()) return

    if (activeMode === 'synthesis') {
      synthesisMutation.mutate({ topic: queryText })
    } else {
      askMutation.mutate({ query: queryText, mode: activeMode })
    }
  }

  const handleSave = () => {
    if (!result) return
    if (result.mode === 'synthesis') {
      if (!result.data?.note) return
      synthesisSaveMutation.mutate({
        requestId: result.data.requestId,
        note: result.data.note
      })
    } else {
      if (!result.data?.note) return
      askSaveMutation.mutate({
        requestId: result.data.requestId,
        note: result.data.note
      })
    }
  }

  return (
    <div className="p-5 max-w-5xl mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)] mb-1">AI Assistant</h1>
          <p className="text-[var(--sea-ink-soft)] text-base">Generate fresh knowledge using local notes or web search.</p>
        </div>
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

      {!result ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto text-center rise-in">
          <h2 className="display-title text-4xl font-extrabold text-[var(--sea-ink)] mb-3 leading-tight tracking-tight">
            What would you like to generate today?
          </h2>
          <p className="text-[var(--sea-ink-soft)] text-sm mb-8 max-w-md">
            Query your local wiki, search the live web for general knowledge, or synthesize multiple pages.
          </p>

          <form onSubmit={handleSubmit} className="w-full relative shadow-md rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] flex items-center p-1.5 focus-within:ring-2 focus-within:ring-[var(--lagoon)] transition-all">
            <div className="shrink-0 pl-3 pr-2 border-r border-[var(--line)]">
              <select
                value={activeMode}
                onChange={(e) => setActiveMode(e.target.value as any)}
                className="bg-transparent text-xs font-bold text-[var(--sea-ink)] focus:outline-none cursor-pointer pr-2 py-2"
              >
                <option value="rag">Ask Wiki (RAG)</option>
                <option value="general">Ask AI (Web Search)</option>
                <option value="synthesis">Synthesize Topic</option>
              </select>
            </div>

            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={
                activeMode === 'rag' 
                  ? "Ask a question about your wiki content..." 
                  : activeMode === 'general' 
                  ? "Ask general knowledge or browse the web..." 
                  : "Enter a topic to synthesize (e.g. 'Drizzle ORM')"
              }
              className="flex-1 bg-transparent px-4 py-3 text-base text-[var(--sea-ink)] focus:outline-none placeholder:text-[var(--sea-ink-soft)]"
            />

            <button
              type="submit"
              disabled={askMutation.isPending || synthesisMutation.isPending}
              className="p-3 bg-sea-ink text-bg-base rounded-xl hover:bg-lagoon-deep hover:text-bg-base disabled:opacity-50 transition-all cursor-pointer shrink-0"
            >
              {askMutation.isPending || synthesisMutation.isPending ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Send size={18} />
              )}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-6 rise-in">
          {/* Consolidated query bar at the top */}
          <div className="island-shell p-3 rounded-xl flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setResult(null)
                setQueryText('')
              }}
              className="p-2 hover:bg-[var(--line)] rounded-full text-[var(--sea-ink-soft)] transition-colors cursor-pointer shrink-0"
              title="New Chat"
            >
              <ChevronRight className="rotate-180" size={18} />
            </button>

            <form onSubmit={handleSubmit} className="flex-1 flex items-center p-1 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)]">
              <div className="shrink-0 pl-3 pr-2 border-r border-[var(--line)]">
                <select
                  value={activeMode}
                  onChange={(e) => setActiveMode(e.target.value as any)}
                  className="bg-transparent text-xs font-bold text-[var(--sea-ink)] focus:outline-none cursor-pointer pr-1 py-1"
                >
                  <option value="rag">Ask Wiki (RAG)</option>
                  <option value="general">Ask AI (Web Search)</option>
                  <option value="synthesis">Synthesize Topic</option>
                </select>
              </div>

              <input
                type="text"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                className="flex-1 bg-transparent px-3 py-1.5 text-sm text-[var(--sea-ink)] focus:outline-none"
              />

              <button
                type="submit"
                disabled={askMutation.isPending || synthesisMutation.isPending}
                className="p-2 mr-1 bg-sea-ink text-bg-base rounded-lg hover:bg-lagoon-deep hover:text-bg-base disabled:opacity-50 transition-colors cursor-pointer"
              >
                {askMutation.isPending || synthesisMutation.isPending ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Send size={14} />
                )}
              </button>
            </form>
          </div>

          {(askMutation.isPending || synthesisMutation.isPending) && (
            <div className="island-shell p-16 rounded-xl text-center flex flex-col items-center">
              <Loader2 className="animate-spin text-[var(--lagoon-deep)] mb-4" size={48} />
              <h3 className="text-xl font-bold text-[var(--sea-ink)] mb-1">Generating Response</h3>
              <p className="text-sm text-[var(--sea-ink-soft)]">Please wait while the AI compiles your knowledge...</p>
            </div>
          )}

          {!(askMutation.isPending || synthesisMutation.isPending) && result.data && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 rise-in">
              {/* Left Column: AI Answer (or Proposed Note for Synthesis) */}
              <section className="island-shell rounded-xl p-5 flex flex-col min-h-[28rem]">
                <h2 className="island-kicker mb-3 flex items-center gap-2">
                  <CheckCircle2 size={12} /> {result.mode === 'synthesis' ? 'Synthesized Wiki Note' : 'AI Response'}
                </h2>
                <div className="flex-1 overflow-y-auto pr-1">
                  <div className="prose prose-slate max-w-none text-sm text-[var(--sea-ink)] leading-relaxed whitespace-pre-wrap font-sans select-text">
                    {result.mode === 'synthesis' ? result.data.note?.content : result.data.answer}
                  </div>
                </div>
              </section>

              {/* Right Column: Details, Draft Note & Ingestion Actions */}
              <section className="flex flex-col gap-5">
                <div className="island-shell rounded-xl p-5 flex-1 border border-[var(--lagoon)] bg-surface-strong relative flex flex-col min-h-[24rem]">
                  <div className="absolute top-0 right-0 p-2.5 bg-[var(--lagoon)] text-white text-[9px] font-bold uppercase tracking-widest rounded-tr-xl rounded-bl-lg shrink-0">
                    Proposed Wiki Draft
                  </div>
                  
                  <h2 className="island-kicker mb-4 flex items-center gap-2 shrink-0">
                    <FileText size={12} /> Note Structure
                  </h2>

                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1">Title</span>
                      <div className="text-xl font-bold text-[var(--sea-ink)]">{result.data.note?.title}</div>
                    </div>

                    {result.mode !== 'synthesis' && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1">Content Summary</span>
                        <div className="text-xs text-[var(--sea-ink-soft)] bg-surface p-3 rounded-lg border border-[var(--line)] font-mono whitespace-pre-wrap overflow-y-auto max-h-[12rem] select-text">
                          {result.data.note?.content}
                        </div>
                      </div>
                    )}

                    {result.mode === 'synthesis' && (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1">Retrieval metrics</span>
                        <div className="text-xs text-[var(--sea-ink-soft)] font-semibold">
                          Chunks Analyzed: {result.data.retrieval?.chunkCount ?? 0} • Links Checked: {result.data.retrieval?.linkCount ?? 0}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                      {result.data.note?.links?.length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] bg-[var(--foam)] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--lagoon-deep)] font-medium">
                          <LinkIcon size={10} /> {result.data.note.links.length} Links
                        </div>
                      )}
                      {result.data.note?.tags?.length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] bg-[var(--foam)] px-2 py-0.5 rounded-full border border-[var(--line)] text-[var(--palm)] font-medium">
                          <TagIcon size={10} /> {result.data.note.tags.length} Tags
                        </div>
                      )}
                    </div>

                    {result.data.sources?.length > 0 && (
                      <div className="border-t border-[var(--line)] pt-3.5 mt-2 shrink-0">
                        <span className="text-[10px] uppercase font-bold text-[var(--sea-ink-soft)] tracking-wider block mb-1.5">Referred Sources</span>
                        <div className="flex flex-wrap gap-1.5">
                          {result.data.sources.map((src: any) => (
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
                  disabled={askSaveMutation.isPending || synthesisSaveMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-lagoon text-lagoon-text rounded-lg font-bold text-base hover:bg-lagoon-deep hover:text-lagoon-text shadow-sm transition-all disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {askSaveMutation.isPending || synthesisSaveMutation.isPending ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <>
                      <Save size={16} />
                      {result.mode === 'synthesis' ? 'Save Synthesized Note' : 'Save to Wiki'}
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
