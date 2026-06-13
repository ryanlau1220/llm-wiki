import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { orpc } from '../lib/orpc'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { z } from 'zod'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { transformWikilinks, transformImageEmbeds } from '../lib/wikilink'
import { 
  BookOpen, 
  Search, 
  FileText, 
  Sparkles, 
  RefreshCw, 
  Info,
  Calendar,
  AlertTriangle,
  Loader2,
  CheckCircle,
  Copy,
  ShieldCheck,
  Eye,
  Network,
  ChevronLeft,
  ExternalLink,
  History,
  RotateCcw
} from 'lucide-react'
import { GraphView } from '../components/GraphView'
import { useMediaQuery } from '../lib/useMediaQuery'
import { computeAlignedDiff } from '../lib/diff'

export const Route = createFileRoute('/vault')({
  validateSearch: z.object({
    noteId: z.string().optional(),
    path: z.string().optional(),
    history: z.boolean().optional(),
  }),
  component: VaultComponent,
})

interface MarkdownLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  notes?: any[];
  setSelectedNoteId: (id: string) => void;
}

function MarkdownLink({ href, children, notes, setSelectedNoteId, ...props }: MarkdownLinkProps) {
  const h = typeof href === 'string' ? href : '';
  const isLocal = h.startsWith('#') || (!h.includes('://') && h.length > 0);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isLocal) {
      let cleanTarget = decodeURIComponent(h);
      if (cleanTarget.startsWith('#')) {
        cleanTarget = cleanTarget.slice(1);
      }
      if (cleanTarget.startsWith('/')) {
        cleanTarget = cleanTarget.slice(1);
      }
      
      const targetSlug = cleanTarget.replace(/\.md$/, '').toLowerCase();
      
      const found = notes?.find(n => 
        n.title?.toLowerCase() === targetSlug || 
        n.path.toLowerCase().endsWith(`/${targetSlug}.md`) ||
        n.path.toLowerCase().split('/').pop()?.replace('.md', '') === targetSlug
      );
      
      if (found) {
        e.preventDefault();
        setSelectedNoteId(found.id);
      } else {
        // Prevent browser navigation to non-existent local route
        e.preventDefault();
        console.warn(`Local note target not found in loaded notes: ${targetSlug}`);
      }
    }
  };

  return (
    <a
      href={h || undefined}
      onClick={handleClick}
      className={isLocal ? "cursor-pointer text-[var(--lagoon-deep)] hover:underline font-bold" : "text-[var(--lagoon-deep)] hover:underline"}
      {...props}
    >
      {children}
    </a>
  );
}

function VaultComponent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { noteId: queryNoteId, path: queryPath, history: queryHistory } = Route.useSearch()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(queryNoteId || null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'detail' | 'graph'>('detail')
  const isMobile = useMediaQuery('(max-width: 1024px)')
  const [isMobileListOpen, setIsMobileListOpen] = useState(false)
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false)
  const [selectedForSynthesis, setSelectedForSynthesis] = useState<Set<string>>(new Set())

  const [showHistory, setShowHistory] = useState(false)
  const [selectedBackupTimestamp, setSelectedBackupTimestamp] = useState<string | null>(null)

  const leftScrollRef = useRef<HTMLDivElement>(null)
  const rightScrollRef = useRef<HTMLDivElement>(null)
  const activeScrollRef = useRef<'left' | 'right' | null>(null)

  const syncScroll = (source: 'left' | 'right') => {
    if (activeScrollRef.current !== source) return
    const sourceEl = source === 'left' ? leftScrollRef.current : rightScrollRef.current
    const targetEl = source === 'left' ? rightScrollRef.current : leftScrollRef.current
    if (sourceEl && targetEl) {
      targetEl.scrollTop = sourceEl.scrollTop
    }
  }

  const { data: graphData, isLoading: isLoadingGraph } = useQuery({
    ...orpc.getGraph.queryOptions(),
    enabled: viewMode === 'graph',
  })

  const { data: notes, isLoading: isLoadingNotes } = useQuery(
    orpc.listNotes.queryOptions()
  )

  const { data: settings } = useQuery(
    orpc.getSettings.queryOptions()
  )

  const getObsidianUri = (notePath: string) => {
    if (!settings?.vaultPath) return ''
    const vaultPathClean = settings.vaultPath.replace(/\\/g, '/')
    const vaultName = vaultPathClean.split('/').filter(Boolean).pop() || 'vault'
    return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(notePath)}`
  }

  useEffect(() => {
    if (queryNoteId) {
      setSelectedNoteId(queryNoteId)
    } else if (queryPath && notes) {
      const found = notes.find(n => n.path === queryPath)
      if (found) {
        setSelectedNoteId(found.id)
      }
    }
  }, [queryNoteId, queryPath, notes])

  const { data: activeNote, isLoading: isLoadingActiveNote } = useQuery({
    ...orpc.getNote.queryOptions({ input: { id: selectedNoteId ?? '' } }),
    enabled: !!selectedNoteId,
  })

  useEffect(() => {
    if (selectedNoteId) {
      // Reset selected backup when switching notes
      setSelectedBackupTimestamp(null)
    }
    if (queryHistory) {
      setShowHistory(true)
    } else {
      setShowHistory(false)
    }
    setSelectedBackupTimestamp(null)
  }, [selectedNoteId, queryHistory])

  const { data: backups, isLoading: isLoadingBackups } = useQuery({
    ...orpc.listBackups.queryOptions({ input: { path: activeNote?.path ?? '' } }),
    enabled: !!activeNote && showHistory,
  })

  const { data: backupContentData, isLoading: isLoadingBackupContent } = useQuery({
    ...orpc.getBackupContent.queryOptions({ 
      input: { path: activeNote?.path ?? '', timestamp: selectedBackupTimestamp ?? '' } 
    }),
    enabled: !!activeNote && !!selectedBackupTimestamp && showHistory,
  })

  const restoreBackupMutation = useMutation(
    orpc.restoreBackup.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries()
        setShowHistory(false)
        setSelectedBackupTimestamp(null)
        navigate({ to: '/vault', search: { noteId: selectedNoteId || undefined, path: undefined, history: undefined } })
      }
    })
  )

  const reindexAllMutation = useMutation(
    orpc.reindexAll.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries()
      }
    })
  )

  const filteredNotes = notes?.filter(note => 
    note.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.title?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path)
    setCopiedPath(path)
    setTimeout(() => setCopiedPath(null), 2000)
  }

  const getScoreColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'text-slate-400 bg-slate-100 border-slate-200'
    if (score >= 0.75) return 'text-green-700 bg-green-50 border-green-200'
    if (score >= 0.5) return 'text-amber-700 bg-amber-50 border-amber-200'
    return 'text-red-700 bg-red-50 border-red-200'
  }

  const getScoreBadge = (score: number | null | undefined) => {
    if (score === null || score === undefined) return 'N/A'
    return `${(score * 100).toFixed(0)}%`
  }

  return (
    <div className="p-4 lg:p-5 max-w-7xl mx-auto h-[calc(100vh-57px)] lg:h-[calc(100vh-2rem)] flex flex-col">
      <header className="mb-5 shrink-0 flex justify-between items-center">
        <div>
          <h1 className="display-title text-3xl font-bold text-sea-ink mb-1">Wiki Pages</h1>
          <p className="text-sea-ink-soft text-base">Explore and manage notes stored in your local knowledge vault.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle Detail / Graph View */}
          <div className="flex bg-foam border border-line rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("detail")}
              className={`px-3 py-1.5 rounded-md transition-all font-bold cursor-pointer ${
                viewMode === "detail" 
                  ? "bg-lagoon text-lagoon-text shadow-sm" 
                  : "text-sea-ink-soft hover:text-sea-ink"
              }`}
            >
              Detail View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("graph")}
              className={`px-3 py-1.5 rounded-md transition-all font-bold cursor-pointer ${
                viewMode === "graph" 
                  ? "bg-lagoon text-lagoon-text shadow-sm" 
                  : "text-sea-ink-soft hover:text-sea-ink"
              }`}
            >
              Graph View
            </button>
          </div>

          {reindexAllMutation.isSuccess && (
            <span className="flex items-center gap-1.5 text-xs text-green-700 font-bold bg-green-50 px-3 py-1.5 rounded-lg border border-green-150 rise-in">
              <ShieldCheck size={14} /> Synced
            </span>
          )}
          <button
            type="button"
            disabled={reindexAllMutation.isPending}
            onClick={() => reindexAllMutation.mutate(undefined)}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--lagoon)] text-white hover:bg-[var(--lagoon-deep)] transition-all font-bold text-sm rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
          >
            {reindexAllMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
            Reindex Vault
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        {viewMode === "detail" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 h-full min-h-0 relative">
            {/* Notes List Column */}
            {(!isMobile || selectedNoteId === null) && (
              <section className="lg:col-span-1 island-shell rounded-xl p-4 flex flex-col min-h-0 animate-fade-in">
                <div className="relative mb-4 shrink-0">
                  <Search className="absolute left-4 top-3 text-sea-ink-soft" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search wiki pages..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-foam border border-line rounded-lg py-2.5 pl-11 pr-4 text-sm text-sea-ink focus:outline-none focus:ring-2 focus:ring-lagoon shadow-inner"
                  />
                </div>

                <div className="flex-1 overflow-y-auto pr-1 space-y-1.5">
                  {isLoadingNotes ? (
                    <div className="flex justify-center items-center py-20">
                      <Loader2 className="animate-spin text-lagoon-deep" size={28} />
                    </div>
                  ) : filteredNotes.length === 0 ? (
                    <div className="text-center py-20 text-sm text-sea-ink-soft italic">
                      No notes found matching search.
                    </div>
                  ) : (
                    filteredNotes.map((note) => {
                      const isActive = note.id === selectedNoteId
                      const isAI = note.isAiGenerated || note.path.includes('ai-generated/') || (note.qualityMetrics?.is_ai)
                      
                      const isSelectedForSynthesis = selectedForSynthesis.has(note.id)
                      return (
                        <div
                          key={note.id}
                          className={`w-full flex items-center p-3 rounded-lg border transition-all text-left group ${
                            isActive 
                              ? 'bg-foam/80 border-line text-sea-ink font-semibold shadow-sm scale-[1.01]' 
                              : 'bg-surface border-transparent hover:bg-foam/30 hover:border-line'
                          }`}
                        >
                          <div className="mr-3 flex items-center shrink-0">
                            <input
                              type="checkbox"
                              checked={isSelectedForSynthesis}
                              onChange={(e) => {
                                setSelectedForSynthesis((prev) => {
                                  const next = new Set(prev)
                                  if (e.target.checked) {
                                    next.add(note.id)
                                  } else {
                                    next.delete(note.id)
                                  }
                                  return next
                                })
                              }}
                              className="h-4 w-4 rounded border-line text-lagoon focus:ring-lagoon cursor-pointer"
                            />
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => setSelectedNoteId(note.id)}
                            className="flex-1 min-w-0 flex items-center justify-between text-left outline-none cursor-pointer"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold truncate text-sea-ink">
                                {note.title || note.path.split('/').pop()?.replace('.md', '')}
                              </div>
                              <div className="text-[11px] truncate mt-0.5 text-sea-ink-soft">
                                {note.path}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1.5 shrink-0 ml-4">
                              {isAI && (
                                <span className="text-[9px] uppercase tracking-widest font-black px-1.5 py-0.5 rounded bg-lagoon/15 text-lagoon-deep">
                                  AI
                                </span>
                              )}
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${getScoreColor(note.qualityScore)}`}>
                                {getScoreBadge(note.qualityScore)}
                              </span>
                            </div>
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>
            )}

            {/* Note Detail Panel */}
            {(!isMobile || selectedNoteId !== null) && (
              <section className="lg:col-span-2 flex flex-col min-h-0 animate-fade-in">
                {isLoadingActiveNote ? (
                  <div className="island-shell rounded-xl p-5 flex-1 flex flex-col justify-center items-center relative">
                    {isMobile && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNoteId(null)
                          navigate({ to: '/vault', search: { noteId: undefined, path: undefined } })
                        }}
                        className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 bg-foam border border-line text-sea-ink-soft hover:text-sea-ink font-bold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        <ChevronLeft size={16} />
                        Back to List
                      </button>
                    )}
                    <Loader2 className="animate-spin text-lagoon-deep mb-3" size={36} />
                    <p className="text-sm text-sea-ink-soft font-bold">Loading note content...</p>
                  </div>
                ) : activeNote ? (
                  <div className="island-shell rounded-xl p-5 flex-1 flex flex-col min-h-0 relative overflow-hidden rise-in">
                    {isMobile && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNoteId(null)
                          navigate({ to: '/vault', search: { noteId: undefined, path: undefined } })
                        }}
                        className="mb-4 self-start flex items-center gap-1.5 px-3 py-1.5 bg-foam border border-line text-sea-ink-soft hover:text-sea-ink font-bold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        <ChevronLeft size={16} />
                        Back to List
                      </button>
                    )}
                    {/* Header Info */}
                    <div className="border-b border-line pb-4 mb-4 shrink-0">
                      <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
                        <h2 className="display-title text-2xl font-bold text-sea-ink leading-tight">{activeNote.title}</h2>
                        <div className="flex gap-2">
                          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${getScoreColor(activeNote.qualityScore)}`}>
                            Quality: {getScoreBadge(activeNote.qualityScore)}
                          </span>
                          <span className="text-[10px] font-bold bg-foam border border-line text-sea-ink-soft px-2.5 py-1 rounded-full capitalize">
                            {activeNote.type.replace('_', ' ')}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-sea-ink-soft">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileText size={14} className="shrink-0" />
                          <span className="truncate font-mono">
                            {activeNote.path}
                          </span>
                          <button 
                            type="button" 
                            onClick={() => handleCopyPath(activeNote.path)} 
                            className="p-1 rounded hover:bg-foam text-sea-ink-soft shrink-0"
                            title="Copy path"
                          >
                            {copiedPath === activeNote.path ? <CheckCircle size={12} className="text-green-600" /> : <Copy size={12} />}
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Calendar size={14} />
                          <span>Updated {new Date(activeNote.updated_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Grid Content/Metadata split */}
                    {showHistory ? (
                      <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-5 min-h-0 mb-4 overflow-hidden">
                        {/* Left sidebar: backups list */}
                        <div className="xl:col-span-1 flex flex-col min-h-0 bg-surface rounded-xl border border-line p-4 shadow-inner">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="island-kicker">Backup Versions</h3>
                            <button
                              type="button"
                              onClick={() => {
                                setShowHistory(false)
                                setSelectedBackupTimestamp(null)
                                navigate({ to: '/vault', search: { noteId: selectedNoteId || undefined, path: undefined, history: undefined } })
                              }}
                              className="text-xs text-[var(--lagoon-deep)] hover:underline font-bold cursor-pointer"
                            >
                              Back to Note
                            </button>
                          </div>
                          
                          {isLoadingBackups ? (
                            <div className="flex-1 flex justify-center items-center">
                              <Loader2 className="animate-spin text-lagoon-deep" size={24} />
                            </div>
                          ) : !backups || backups.length === 0 ? (
                            <div className="flex-1 flex flex-col justify-center items-center text-center p-4">
                              <History className="text-sea-ink-soft opacity-30 mb-2" size={32} />
                              <p className="text-xs text-sea-ink-soft italic">No backups found for this note.</p>
                              <p className="text-[10px] text-sea-ink-soft/75 mt-1">Backups are automatically created whenever you run a Note Refactor.</p>
                            </div>
                          ) : (
                            <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                              {backups.map((b) => {
                                const isSelected = selectedBackupTimestamp === b.timestamp;
                                return (
                                  <button
                                    type="button"
                                    key={b.timestamp}
                                    onClick={() => setSelectedBackupTimestamp(b.timestamp)}
                                    className={`w-full p-3 rounded-xl border transition-all text-left flex flex-col gap-1 cursor-pointer ${
                                      isSelected
                                        ? 'bg-[var(--foam)] border-[var(--lagoon)] shadow-sm'
                                        : 'bg-surface border-line hover:bg-foam/40'
                                    }`}
                                  >
                                    <span className={`text-xs font-bold ${isSelected ? 'text-[var(--lagoon-deep)]' : 'text-sea-ink'}`}>
                                      {new Date(b.formattedDate).toLocaleString()}
                                    </span>
                                    <div className="flex items-center justify-between text-[10px] text-sea-ink-soft">
                                      <span className="font-mono">{b.timestamp}</span>
                                      <span>{(b.sizeBytes / 1024).toFixed(1)} KB</span>
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        {/* Right sidebar: diff panel */}
                        <div className="xl:col-span-2 flex flex-col min-h-0 bg-surface rounded-xl border border-line p-4 shadow-inner font-mono text-[10px] sm:text-xs leading-relaxed select-text overflow-hidden">
                          {!selectedBackupTimestamp ? (
                            <div className="flex-1 flex flex-col justify-center items-center text-center p-6">
                              <History className="text-sea-ink-soft opacity-20 mb-3" size={48} />
                              <h4 className="text-sm font-bold text-sea-ink mb-1">Select a Backup Version</h4>
                              <p className="text-xs text-sea-ink-soft max-w-sm">Choose a point-in-time backup from the list on the left to see a side-by-side split comparison and restore it.</p>
                            </div>
                          ) : isLoadingBackupContent ? (
                            <div className="flex-1 flex justify-center items-center font-sans">
                              <Loader2 className="animate-spin text-lagoon-deep" size={28} />
                            </div>
                          ) : backupContentData ? (
                            <div className="flex-1 flex flex-col min-h-0">
                              {/* Preview Header */}
                              <div className="flex items-center justify-between border-b border-line pb-3 mb-3 shrink-0 font-sans">
                                <div>
                                  <h4 className="text-xs font-black uppercase text-sea-ink-soft tracking-wider">Comparing Versions</h4>
                                  <p className="text-[11px] text-sea-ink-soft font-mono">
                                    Current Content vs Backup ({(() => {
                                      const found = backups?.find(bk => bk.timestamp === selectedBackupTimestamp);
                                      return found ? new Date(found.formattedDate).toLocaleString() : selectedBackupTimestamp;
                                    })()})
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  disabled={restoreBackupMutation.isPending}
                                  onClick={() => restoreBackupMutation.mutate({
                                    path: activeNote.path,
                                    timestamp: selectedBackupTimestamp
                                  })}
                                  className="px-4 py-2 bg-sea-ink text-bg-base font-bold text-xs rounded-lg flex items-center gap-1.5 hover:bg-lagoon-deep hover:text-bg-base transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                                >
                                  {restoreBackupMutation.isPending ? <Loader2 className="animate-spin" size={12} /> : <RotateCcw size={12} />}
                                  Restore Version
                                </button>
                              </div>

                              {/* Split Diff Container */}
                              <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0 overflow-hidden select-text">
                                {(() => {
                                  const diff = computeAlignedDiff(activeNote.content, backupContentData.content);
                                  let origCounter = 0;
                                  let refCounter = 0;
                                  const alignedDiff = diff.map(line => {
                                    const originalLineNum = line.original.type !== 'empty' ? ++origCounter : null;
                                    const refactoredLineNum = line.refactored.type !== 'empty' ? ++refCounter : null;
                                    return {
                                      ...line,
                                      originalLineNum,
                                      refactoredLineNum
                                    };
                                  });

                                  return (
                                    <>
                                      {/* Left side: Current Content */}
                                      <div className="flex flex-col min-h-0">
                                        <div className="text-[9px] uppercase font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded mb-1.5 self-start font-sans">Current (Will Be Overwritten)</div>
                                        {/* biome-ignore lint/a11y/noStaticElementInteractions: sync scrolling */}
                                        <div 
                                          ref={leftScrollRef}
                                          onMouseEnter={() => { activeScrollRef.current = 'left' }}
                                          onMouseLeave={() => { if (activeScrollRef.current === 'left') activeScrollRef.current = null }}
                                          onScroll={() => syncScroll('left')}
                                          className="flex-1 overflow-y-auto border border-line bg-surface p-3 rounded-lg overflow-x-hidden font-mono text-[10px] sm:text-xs"
                                        >
                                          {alignedDiff.map((line, idx) => (
                                            <div
                                              // biome-ignore lint/suspicious/noArrayIndexKey: static aligned diff lines
                                              key={idx}
                                              className={`flex min-h-[1.5rem] px-1.5 rounded ${
                                                line.original.type === 'removed'
                                                  ? 'bg-red-500/10 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-l-2 border-red-500 font-semibold'
                                                  : line.original.type === 'empty'
                                                  ? 'bg-slate-100/50 dark:bg-slate-900/20 opacity-30 select-none'
                                                  : 'text-sea-ink-soft'
                                              }`}
                                            >
                                              <span className="w-8 shrink-0 opacity-40 select-none text-right pr-2 text-[10px] font-mono">{line.originalLineNum ?? ''}</span>
                                              <span className="whitespace-pre-wrap">{line.original.content}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Right side: Backup Content */}
                                      <div className="flex flex-col min-h-0">
                                        <div className="text-[9px] uppercase font-bold text-green-500 bg-green-500/10 px-2 py-1 rounded mb-1.5 self-start font-sans">Backup Version (Target)</div>
                                        {/* biome-ignore lint/a11y/noStaticElementInteractions: sync scrolling */}
                                        <div 
                                          ref={rightScrollRef}
                                          onMouseEnter={() => { activeScrollRef.current = 'right' }}
                                          onMouseLeave={() => { if (activeScrollRef.current === 'right') activeScrollRef.current = null }}
                                          onScroll={() => syncScroll('right')}
                                          className="flex-1 overflow-y-auto border border-line bg-surface p-3 rounded-lg overflow-x-hidden font-mono text-[10px] sm:text-xs"
                                        >
                                          {alignedDiff.map((line, idx) => (
                                            <div
                                              // biome-ignore lint/suspicious/noArrayIndexKey: static aligned diff lines
                                              key={idx}
                                              className={`flex min-h-[1.5rem] px-1.5 rounded ${
                                                line.refactored.type === 'added'
                                                  ? 'bg-green-500/10 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-l-2 border-green-500 font-semibold'
                                                  : line.refactored.type === 'empty'
                                                  ? 'bg-slate-100/50 dark:bg-slate-900/20 opacity-30 select-none'
                                                  : 'text-sea-ink'
                                              }`}
                                            >
                                              <span className="w-8 shrink-0 opacity-40 select-none text-right pr-2 text-[10px] font-mono">{line.refactoredLineNum ?? ''}</span>
                                              <span className="whitespace-pre-wrap">{line.refactored.content}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-5 min-h-0 mb-4">
                        {/* Markdown content */}
                      <div className="xl:col-span-2 flex flex-col min-h-0 bg-surface rounded-xl border border-line p-4 shadow-inner">
                        <h3 className="island-kicker mb-2">Document Content</h3>
                        <div className="flex-1 overflow-y-auto pr-1 prose prose-slate max-w-none text-sm text-sea-ink leading-relaxed font-sans select-text selection:bg-lagoon/20 dark:prose-invert">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ href, children, ...props }) => (
                                <MarkdownLink
                                  href={href}
                                  notes={notes}
                                  setSelectedNoteId={setSelectedNoteId}
                                  {...props}
                                >
                                  {children}
                                </MarkdownLink>
                              )
                            }}
                          >
                            {transformWikilinks(transformImageEmbeds(activeNote.content))}
                          </ReactMarkdown>
                        </div>
                      </div>

                      {/* Metadata / Details */}
                      <div className="xl:col-span-1 space-y-4 overflow-y-auto pr-1">
                        <div className="bg-foam/80 rounded-xl border border-line p-4">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-sea-ink-soft mb-3 flex items-center gap-1.5">
                            <Info size={12} /> Quality Metrics
                          </h4>
                          {activeNote.qualityMetrics ? (
                            <div className="space-y-3.5">
                              <div>
                                <div className="flex justify-between text-xs text-sea-ink-soft font-bold mb-1">
                                  <span>Link Density</span>
                                  <span>{(activeNote.qualityMetrics.link_density ?? 0).toFixed(2)}</span>
                                </div>
                                <div className="w-full bg-line h-1 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-lagoon h-full" 
                                    style={{ width: `${Math.min((activeNote.qualityMetrics.link_density ?? 0) * 100, 100)}%` }} 
                                    />
                                </div>
                              </div>

                              <div>
                                <div className="flex justify-between text-xs text-sea-ink-soft font-bold mb-1">
                                  <span>Completeness</span>
                                  <span>{activeNote.qualityMetrics.has_title && activeNote.qualityMetrics.has_tags ? '100%' : '50%'}</span>
                                </div>
                                <div className="w-full bg-line h-1 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-palm h-full" 
                                    style={{ width: activeNote.qualityMetrics.has_title && activeNote.qualityMetrics.has_tags ? '100%' : '50%' }} 
                                    />
                                </div>
                              </div>

                              {activeNote.qualityMetrics.reasons?.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-line">
                                  <span className="text-[9px] uppercase font-bold text-sea-ink-soft tracking-wider block mb-1.5">Quality Alerts</span>
                                  <div className="space-y-1">
                                    {activeNote.qualityMetrics.reasons.map((r: string) => (
                                      <div key={r} className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 font-medium">
                                        <AlertTriangle size={10} className="shrink-0" />
                                        <span className="truncate">{r.replace(/_/g, ' ')}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] text-sea-ink-soft italic">No metrics parsed.</p>
                          )}
                        </div>

                        {/* Actions Box */}
                        <div className="bg-surface border border-line rounded-xl p-4 space-y-2">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-sea-ink-soft mb-1">Actions</h4>
                          
                          <button
                            type="button"
                            onClick={() => navigate({ to: '/refactor', search: { path: activeNote.path } })}
                            className="w-full py-2 bg-sea-ink text-bg-base font-bold text-sm rounded-lg flex items-center justify-center gap-2 hover:bg-lagoon-deep hover:text-bg-base transition-colors shadow-sm cursor-pointer"
                          >
                            <Sparkles size={14} />
                            Refactor Note
                          </button>

                          <button
                            type="button"
                            onClick={() => setViewMode("graph")}
                            className="w-full py-2 bg-foam border border-line text-sea-ink font-bold text-sm rounded-lg flex items-center justify-center gap-2 hover:bg-line transition-colors cursor-pointer"
                          >
                            <Network size={14} />
                            Open Graph View
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowHistory(prev => !prev)}
                            className={`w-full py-2 border font-bold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                              showHistory
                                ? 'bg-sea-ink text-bg-base border-sea-ink hover:bg-lagoon-deep'
                                : 'bg-foam border-line text-sea-ink hover:bg-line'
                            }`}
                          >
                            <History size={14} />
                            Version History
                          </button>

                          <a
                            href={getObsidianUri(activeNote.path)}
                            className="w-full py-2 bg-foam border border-line text-sea-ink font-bold text-sm rounded-lg flex items-center justify-center gap-2 hover:bg-line transition-colors shadow-sm text-center no-underline cursor-pointer"
                          >
                            <ExternalLink size={14} />
                            Open in Obsidian
                          </a>
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                ) : (
                  <div className="island-shell rounded-xl p-5 flex-1 flex flex-col justify-center items-center text-center relative">
                    {isMobile && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNoteId(null)
                          navigate({ to: '/vault', search: { noteId: undefined, path: undefined } })
                        }}
                        className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 bg-foam border border-line text-sea-ink-soft hover:text-sea-ink font-bold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        <ChevronLeft size={16} />
                        Back to List
                      </button>
                    )}
                    <BookOpen className="text-sea-ink-soft opacity-30 mb-3" size={48} />
                    <h3 className="text-xl font-bold text-sea-ink mb-1">No Note Selected</h3>
                    <p className="text-sm text-sea-ink-soft max-w-sm">Select a note from the sidebar list to inspect its contents, check quality scores, and perform actions.</p>
                  </div>
                )}
              </section>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5 h-full min-h-0 relative">
            {/* Column 1: Notes List (width 1/4) */}
            {!isMobile && (
              <section className="lg:col-span-1 island-shell rounded-xl p-4 flex flex-col min-h-0">
                <div className="relative mb-4 shrink-0">
                  <Search className="absolute left-4 top-3 text-sea-ink-soft" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search wiki pages..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-foam border border-line rounded-lg py-2.5 pl-11 pr-4 text-sm text-sea-ink focus:outline-none focus:ring-2 focus:ring-lagoon shadow-inner"
                  />
                </div>

                <div className="flex-1 overflow-y-auto pr-1 space-y-1.5">
                  {isLoadingNotes ? (
                    <div className="flex justify-center items-center py-20">
                      <Loader2 className="animate-spin text-lagoon-deep" size={28} />
                    </div>
                  ) : filteredNotes.length === 0 ? (
                    <div className="text-center py-20 text-sm text-sea-ink-soft italic">
                      No notes found matching search.
                    </div>
                  ) : (
                    filteredNotes.map((note) => {
                      const isActive = note.id === selectedNoteId
                      const isAI = note.isAiGenerated || note.path.includes('ai-generated/') || (note.qualityMetrics?.is_ai)
                      const isSelectedForSynthesis = selectedForSynthesis.has(note.id)
                      
                      return (
                        <div
                          key={note.id}
                          className={`w-full flex items-center p-3 rounded-lg border transition-all text-left group ${
                            isActive 
                              ? 'bg-foam/80 border-line text-sea-ink font-semibold shadow-sm scale-[1.01]' 
                              : 'bg-surface border-transparent hover:bg-foam/30 hover:border-line'
                          }`}
                        >
                          <div className="mr-3 flex items-center shrink-0">
                            <input
                              type="checkbox"
                              checked={isSelectedForSynthesis}
                              onChange={(e) => {
                                setSelectedForSynthesis((prev) => {
                                  const next = new Set(prev)
                                  if (e.target.checked) {
                                    next.add(note.id)
                                  } else {
                                    next.delete(note.id)
                                  }
                                  return next
                                })
                              }}
                              className="h-4 w-4 rounded border-line text-lagoon focus:ring-lagoon cursor-pointer"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => setSelectedNoteId(note.id)}
                            className="flex-1 min-w-0 flex items-center justify-between text-left outline-none cursor-pointer"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold truncate text-sea-ink">
                                {note.title || note.path.split('/').pop()?.replace('.md', '')}
                              </div>
                              <div className="text-[11px] truncate mt-0.5 text-sea-ink-soft">
                                {note.path}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1.5 shrink-0 ml-4">
                              {isAI && (
                                <span className="text-[9px] uppercase tracking-widest font-black px-1.5 py-0.5 rounded bg-lagoon/15 text-lagoon-deep">
                                  AI
                                </span>
                              )}
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${getScoreColor(note.qualityScore)}`}>
                                {getScoreBadge(note.qualityScore)}
                              </span>
                            </div>
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </section>
            )}

            {/* Column 2: Graph Canvas (width 2/4) */}
            <section className={`${isMobile ? 'col-span-1' : 'lg:col-span-2'} flex flex-col min-h-0 relative`}>
              {isLoadingGraph ? (
                <div className="flex-1 flex flex-col justify-center items-center bg-surface border border-line rounded-2xl p-5 shadow-inner">
                  <Loader2 className="animate-spin text-lagoon-deep mb-3" size={36} />
                  <p className="text-sm text-sea-ink-soft font-bold">Building knowledge graph...</p>
                </div>
              ) : graphData ? (
                <GraphView
                  rawNodes={graphData.nodes}
                  rawEdges={graphData.edges}
                  selectedNoteId={selectedNoteId}
                  onSelectNote={(id) => {
                    setSelectedNoteId(id)
                    if (isMobile) {
                      setIsMobilePreviewOpen(true)
                    }
                  }}
                />
              ) : (
                <div className="flex-1 flex flex-col justify-center items-center bg-surface border border-line rounded-2xl p-5 shadow-inner text-center">
                  <Network className="text-sea-ink-soft opacity-30 mb-3" size={48} />
                  <p className="text-sm text-sea-ink-soft font-bold">Failed to load graph.</p>
                </div>
              )}
            </section>

            {/* Column 3: Note Content Preview (width 1/4) */}
            {!isMobile && (
              <section className="lg:col-span-1 flex flex-col min-h-0 bg-surface rounded-2xl border border-line p-4 shadow-inner">
                {isLoadingActiveNote ? (
                  <div className="flex-1 flex flex-col justify-center items-center">
                    <Loader2 className="animate-spin text-lagoon-deep mb-2" size={24} />
                    <span className="text-xs text-sea-ink-soft">Loading preview...</span>
                  </div>
                ) : activeNote ? (
                  <div className="flex-1 flex flex-col min-h-0">
                    <header className="border-b border-line pb-3 mb-3 shrink-0">
                      <h3 className="font-bold text-base text-sea-ink line-clamp-2 leading-tight">
                        {activeNote.title}
                      </h3>
                      <span className="text-[10px] bg-foam border border-line text-sea-ink-soft px-2 py-0.5 rounded-full capitalize inline-block mt-1 font-mono">
                        {activeNote.type.replace('_', ' ')}
                      </span>
                    </header>

                    <div className="flex-1 overflow-y-auto pr-1 prose prose-slate max-w-none text-xs text-sea-ink leading-relaxed font-sans select-text selection:bg-lagoon/20 dark:prose-invert">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ href, children, ...props }) => (
                            <MarkdownLink
                              href={href}
                              notes={notes}
                              setSelectedNoteId={setSelectedNoteId}
                              {...props}
                            >
                              {children}
                            </MarkdownLink>
                          )
                        }}
                      >
                        {transformWikilinks(transformImageEmbeds(activeNote.content))}
                      </ReactMarkdown>
                    </div>

                    <div className="mt-3 pt-3 border-t border-line shrink-0 flex gap-2">
                      <button
                        type="button"
                        onClick={() => navigate({ to: '/refactor', search: { path: activeNote.path } })}
                        className="flex-1 py-1.5 bg-sea-ink text-bg-base font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 hover:bg-lagoon-deep hover:text-white transition-colors cursor-pointer"
                      >
                        <Sparkles size={12} />
                        Refactor
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("detail")}
                        className="px-2.5 py-1.5 bg-foam border border-line text-sea-ink-soft hover:text-sea-ink font-bold text-xs rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                        title="Open Detail View"
                      >
                        <Eye size={12} />
                      </button>
                      <a
                        href={getObsidianUri(activeNote.path)}
                        className="px-2.5 py-1.5 bg-foam border border-line text-sea-ink-soft hover:text-sea-ink font-bold text-xs rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                        title="Open in Obsidian"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-center items-center text-center p-4">
                    <BookOpen className="text-sea-ink-soft opacity-30 mb-2" size={36} />
                    <h4 className="text-sm font-bold text-sea-ink mb-1">No Selection</h4>
                    <p className="text-xs text-sea-ink-soft max-w-xs leading-normal">
                      Select a note in the graph or sidebar list to display its preview.
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Mobile Graph Overlays */}
            {isMobile && (
              <>
                {/* Floating Buttons */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-3 bg-surface-strong/90 backdrop-blur-md border border-line p-2 rounded-2xl shadow-xl">
                  <button
                    type="button"
                    onClick={() => setIsMobileListOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-foam hover:bg-line text-sea-ink font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer border border-line"
                  >
                    <Search size={14} />
                    Search List
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMobilePreviewOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-foam hover:bg-line text-sea-ink font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer border border-line"
                  >
                    <FileText size={14} />
                    Note Preview
                  </button>
                </div>

                {/* Mobile Search List Drawer */}
                  {isMobileListOpen && (
                    <button
                      type="button"
                      aria-label="Close search drawer"
                      className="fixed inset-0 bg-black/40 backdrop-blur-xs z-30 transition-opacity duration-300 border-none outline-none cursor-default"
                      onClick={() => setIsMobileListOpen(false)}
                    />
                  )}
                  <div 
                    className={`fixed top-0 left-0 h-screen w-80 max-w-[85vw] bg-[var(--surface-strong)] border-r border-[var(--line)] z-40 transition-transform duration-300 ease-out flex flex-col p-4 shadow-2xl ${
                      isMobileListOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-line shrink-0">
                      <span className="font-extrabold text-sm text-sea-ink uppercase tracking-wider">Search Notes</span>
                      <button 
                        type="button" 
                        onClick={() => setIsMobileListOpen(false)}
                        className="text-sea-ink-soft hover:text-sea-ink text-xs font-bold px-2.5 py-1 rounded bg-foam border border-line cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                    <div className="flex-1 min-h-0 flex flex-col">
                      <div className="relative mb-4 shrink-0">
                        <Search className="absolute left-4 top-3 text-sea-ink-soft" size={18} />
                        <input 
                          type="text" 
                          placeholder="Search wiki pages..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full bg-foam border border-line rounded-lg py-2.5 pl-11 pr-4 text-sm text-sea-ink focus:outline-none focus:ring-2 focus:ring-lagoon shadow-inner"
                        />
                      </div>

                      <div className="flex-1 overflow-y-auto pr-1 space-y-1.5">
                        {isLoadingNotes ? (
                          <div className="flex justify-center items-center py-20">
                            <Loader2 className="animate-spin text-lagoon-deep" size={28} />
                          </div>
                        ) : filteredNotes.length === 0 ? (
                          <div className="text-center py-20 text-sm text-sea-ink-soft italic">
                            No notes found matching search.
                          </div>
                        ) : (
                          filteredNotes.map((note) => {
                            const isActive = note.id === selectedNoteId
                            const isAI = note.isAiGenerated || note.path.includes('ai-generated/') || (note.qualityMetrics?.is_ai)
                            
                            return (
                              <button
                                type="button"
                                key={note.id}
                                onClick={() => {
                                  setSelectedNoteId(note.id)
                                  setIsMobileListOpen(false)
                                }}
                                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left group ${
                                  isActive 
                                    ? 'bg-foam/80 border-line text-sea-ink font-semibold shadow-sm scale-[1.01]' 
                                    : 'bg-surface border-transparent hover:bg-foam/30 hover:border-line'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className={`text-sm font-bold truncate ${isActive ? 'text-sea-ink' : 'text-sea-ink'}`}>
                                    {note.title || note.path.split('/').pop()?.replace('.md', '')}
                                  </div>
                                  <div className="text-[11px] truncate mt-0.5 text-sea-ink-soft">
                                    {note.path}
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-1.5 shrink-0 ml-4">
                                  {isAI && (
                                    <span className="text-[9px] uppercase tracking-widest font-black px-1.5 py-0.5 rounded bg-lagoon/15 text-lagoon-deep">
                                      AI
                                    </span>
                                  )}
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${getScoreColor(note.qualityScore)}`}>
                                    {getScoreBadge(note.qualityScore)}
                                  </span>
                                </div>
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </div>

                {/* Mobile Note Preview Bottom Sheet */}
                {isMobilePreviewOpen && (
                    <button
                      type="button"
                      aria-label="Close note preview bottom sheet"
                      className="fixed inset-0 bg-black/40 backdrop-blur-xs z-30 transition-opacity duration-300 border-none outline-none cursor-default"
                      onClick={() => setIsMobilePreviewOpen(false)}
                    />
                  )}
                  <div 
                    className={`fixed bottom-0 left-0 w-full h-[60vh] bg-[var(--surface-strong)] border-t border-[var(--line)] z-40 transition-transform duration-300 ease-out flex flex-col p-4 rounded-t-3xl shadow-2xl ${
                      isMobilePreviewOpen ? 'translate-y-0' : 'translate-y-full'
                    }`}
                  >
                    <div className="w-12 h-1.5 bg-line rounded-full mx-auto mb-3 shrink-0" />
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-line shrink-0">
                      <span className="font-extrabold text-sm text-sea-ink uppercase tracking-wider">Note Preview</span>
                      <button 
                        type="button" 
                        onClick={() => setIsMobilePreviewOpen(false)}
                        className="text-sea-ink-soft hover:text-sea-ink text-xs font-bold px-2.5 py-1 rounded bg-foam border border-line cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      {isLoadingActiveNote ? (
                        <div className="flex justify-center items-center py-20">
                          <Loader2 className="animate-spin text-lagoon-deep mb-2" size={24} />
                          <span className="text-xs text-sea-ink-soft">Loading preview...</span>
                        </div>
                      ) : activeNote ? (
                        <div className="flex-1 flex flex-col min-h-0">
                          <header className="border-b border-line pb-3 mb-3 shrink-0">
                            <h3 className="font-bold text-base text-sea-ink line-clamp-2 leading-tight">
                              {activeNote.title}
                            </h3>
                            <span className="text-[10px] bg-foam border border-line text-sea-ink-soft px-2 py-0.5 rounded-full capitalize inline-block mt-1 font-mono">
                              {activeNote.type.replace('_', ' ')}
                            </span>
                          </header>

                          <div className="flex-1 overflow-y-auto pr-1 prose prose-slate max-w-none text-xs text-sea-ink leading-relaxed font-sans select-text selection:bg-lagoon/20 dark:prose-invert">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                a: ({ href, children, ...props }) => (
                                  <MarkdownLink
                                    href={href}
                                    notes={notes}
                                    setSelectedNoteId={setSelectedNoteId}
                                    {...props}
                                  >
                                    {children}
                                  </MarkdownLink>
                                )
                              }}
                            >
                              {transformWikilinks(transformImageEmbeds(activeNote.content))}
                            </ReactMarkdown>
                          </div>

                          <div className="mt-3 pt-3 border-t border-line shrink-0 flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                navigate({ to: '/refactor', search: { path: activeNote.path } })
                                setIsMobilePreviewOpen(false)
                              }}
                              className="flex-1 py-1.5 bg-sea-ink text-bg-base font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 hover:bg-lagoon-deep hover:text-white transition-colors cursor-pointer"
                            >
                              <Sparkles size={12} />
                              Refactor Note
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setViewMode("detail")
                                setIsMobilePreviewOpen(false)
                              }}
                              className="px-2.5 py-1.5 bg-foam border border-line text-sea-ink-soft hover:text-sea-ink font-bold text-xs rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                              title="Open Detail View"
                            >
                              <Eye size={12} />
                              Detail View
                            </button>
                            <a
                              href={getObsidianUri(activeNote.path)}
                              onClick={() => setIsMobilePreviewOpen(false)}
                              className="px-2.5 py-1.5 bg-foam border border-line text-sea-ink-soft hover:text-sea-ink font-bold text-xs rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                              title="Open in Obsidian"
                            >
                              <ExternalLink size={12} />
                            </a>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col justify-center items-center text-center p-8">
                          <BookOpen className="text-sea-ink-soft opacity-30 mb-2" size={36} />
                          <h4 className="text-sm font-bold text-sea-ink mb-1">No Selection</h4>
                          <p className="text-xs text-sea-ink-soft max-w-xs leading-normal">
                            Select a note in the graph or search drawer to display its preview.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
              </>
            )}
          </div>
        )}
      </div>

      {selectedForSynthesis.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 px-5 py-3 bg-[var(--surface-strong)] border border-[var(--line)] rounded-2xl shadow-2xl rise-in">
          <span className="text-xs font-bold text-[var(--sea-ink)]">
            {selectedForSynthesis.size} notes selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelectedForSynthesis(new Set())}
              className="px-3 py-1.5 bg-foam hover:bg-line text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)] font-bold text-xs rounded-xl transition-colors cursor-pointer border border-line"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const noteIds = Array.from(selectedForSynthesis).join(',')
                navigate({ to: '/generator', search: { mode: 'synthesis', noteIds } })
              }}
              className="px-4 py-1.5 bg-[var(--lagoon)] hover:bg-[var(--lagoon-deep)] text-white font-bold text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
            >
              Synthesize Selected
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
