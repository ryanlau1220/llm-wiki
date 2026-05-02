import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { orpc } from '../lib/orpc'
import { useMutation, useQuery } from '@tanstack/react-query'
import { 
  RotateCcw, 
  FileText, 
  Loader2, 
  ChevronRight, 
  CheckCircle2,
  AlertCircle,
  Save,
  Search
} from 'lucide-react'

export const Route = createFileRoute('/refactor')({
  component: RefactorComponent,
})

function RefactorComponent() {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const { data: notes, isLoading: isLoadingNotes } = useQuery(
    orpc.listNotes.queryOptions()
  )

  const previewMutation = useMutation(
    orpc.refactorPreview.mutationOptions({
      onSuccess: (data) => {
        setPreviewData(data)
      }
    })
  )

  const confirmMutation = useMutation(
    orpc.confirmRefactorSave.mutationOptions({
      onSuccess: () => {
        setPreviewData(null)
        setSelectedPath(null)
      }
    })
  )

  const handleRefactor = (path: string) => {
    setSelectedPath(path)
    previewMutation.mutate({ path })
  }

  const filteredNotes = notes?.filter(note => 
    note.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.title?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-12">
        <h1 className="display-title text-4xl font-bold text-[var(--sea-ink)] mb-2">Note Refactor</h1>
        <p className="text-[var(--sea-ink-soft)] text-lg">Clean up and structure messy notes using AI.</p>
      </header>

      {!selectedPath ? (
        <section className="island-shell rounded-[2.5rem] p-8 overflow-hidden">
          <div className="relative mb-6">
            <Search className="absolute left-4 top-3.5 text-[var(--sea-ink-soft)]" size={20} />
            <input 
              type="text" 
              placeholder="Search notes to refactor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[var(--foam)] border border-[var(--line)] rounded-xl py-3 pl-12 pr-4 text-[var(--sea-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] shadow-inner"
            />
          </div>

          {isLoadingNotes ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-[var(--lagoon-deep)]" size={32} />
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto pr-2 space-y-2">
              {filteredNotes?.map((note) => (
                <button
                  type="button"
                  key={note.id}
                  onClick={() => handleRefactor(note.path)}
                  className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-[var(--foam)] border border-transparent hover:border-[var(--line)] transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <FileText size={20} className="text-[var(--sea-ink-soft)]" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-[var(--sea-ink)]">{note.title || note.path.split('/').pop()}</div>
                      <div className="text-xs text-[var(--sea-ink-soft)]">{note.path}</div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-[var(--line)] group-hover:text-[var(--lagoon-deep)] transition-colors" />
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="rise-in">
          <div className="flex items-center gap-4 mb-8">
            <button 
              type="button"
              onClick={() => { setSelectedPath(null); setPreviewData(null); }}
              className="p-2 hover:bg-[var(--line)] rounded-full text-[var(--sea-ink-soft)] transition-colors"
            >
              <ChevronRight size={24} className="rotate-180" />
            </button>
            <h2 className="text-2xl font-bold text-[var(--sea-ink)]">Refactoring: {selectedPath.split('/').pop()}</h2>
          </div>

          {previewMutation.isPending && (
            <div className="island-shell p-20 rounded-[3rem] text-center flex flex-col items-center">
              <RotateCcw className="animate-spin text-[var(--lagoon-deep)] mb-6" size={64} />
              <h3 className="text-2xl font-bold text-[var(--sea-ink)] mb-2">Analyzing Note</h3>
              <p className="text-[var(--sea-ink-soft)]">AI is restructuring your content for better clarity...</p>
            </div>
          )}

          {previewData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
               <article className="island-shell p-8 rounded-[2rem]">
                <h3 className="island-kicker mb-4 flex items-center gap-2">Original Content</h3>
                <div className="prose prose-sm max-w-none text-[var(--sea-ink-soft)] line-clamp-[20]">
                   {/* In a real app we'd fetch the actual content, but for preview we show the result */}
                   <p className="italic">Original file: {selectedPath}</p>
                </div>
              </article>

              <div className="flex flex-col gap-6">
                <article className="island-shell p-8 rounded-[2rem] border-2 border-[var(--lagoon)] bg-white/50 relative">
                  <div className="absolute top-0 right-0 p-3 bg-[var(--lagoon)] text-white text-[10px] font-bold uppercase tracking-widest rounded-bl-lg">
                    Refactored Preview
                  </div>
                  <h3 className="island-kicker mb-6 flex items-center gap-2 text-[var(--lagoon-deep)]">
                    <CheckCircle2 size={14} /> AI Improvements
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="text-xl font-bold text-[var(--sea-ink)]">{previewData.note.title}</div>
                    <div className="text-sm text-[var(--sea-ink)] bg-white/40 p-4 rounded-xl border border-[var(--line)] whitespace-pre-wrap font-mono h-64 overflow-y-auto">
                      {previewData.note.content}
                    </div>
                  </div>
                </article>

                <button
                  type="button"
                  onClick={() => confirmMutation.mutate({
                    requestId: previewData.requestId,
                    sourcePath: selectedPath,
                    note: previewData.note
                  })}
                  disabled={confirmMutation.isPending}
                  className="w-full py-4 bg-[var(--sea-ink)] text-white rounded-3xl font-bold text-lg hover:bg-[var(--lagoon-deep)] shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {confirmMutation.isPending ? <Loader2 className="animate-spin" /> : <><Save size={20} /> Save Refactored Version</>}
                </button>
              </div>
            </div>
          )}

          {previewMutation.isError && (
            <div className="p-12 island-shell rounded-[3rem] text-center">
              <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
              <h3 className="text-xl font-bold text-red-700">Refactor Failed</h3>
              <p className="text-red-600 mb-6">Something went wrong while refactoring the note.</p>
              <button 
                type="button"
                onClick={() => handleRefactor(selectedPath)}
                className="px-6 py-2 bg-[var(--sea-ink)] text-white rounded-xl font-bold"
              >
                Retry
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
