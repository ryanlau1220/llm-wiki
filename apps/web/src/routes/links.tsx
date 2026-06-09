import { createFileRoute } from '@tanstack/react-router'
import { orpc } from '../lib/orpc'
import { useQuery } from '@tanstack/react-query'
import { 
  Link2, 
  ExternalLink, 
  PlusCircle, 
  AlertCircle,
  Loader2,
  FileSearch
} from 'lucide-react'

export const Route = createFileRoute('/links')({
  component: LinksHealthComponent,
})

function LinksHealthComponent() {
  const { data: health, isLoading, isError } = useQuery(
    orpc.getLinkHealth.queryOptions()
  )

  return (
    <div className="p-5 max-w-6xl mx-auto">
      <header className="mb-8">
        <h1 className="display-title text-3xl font-bold text-[var(--sea-ink)] mb-1">Link Health</h1>
        <p className="text-[var(--sea-ink-soft)] text-base">Identify and fix broken wikilinks across your knowledge base.</p>
      </header>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--sea-ink-soft)]">
          <Loader2 className="animate-spin mb-3" size={36} />
          <p className="text-sm">Analyzing knowledge graph...</p>
        </div>
      )}

      {isError && (
        <div className="p-6 bg-red-50 border border-red-100 rounded-xl text-center">
          <AlertCircle className="text-red-500 mx-auto mb-3" size={36} />
          <h2 className="text-lg font-bold text-red-700 mb-1">Analysis Failed</h2>
          <p className="text-sm text-red-600">We couldn't retrieve the link health data. Is the API running?</p>
        </div>
      )}

      {health && health.length === 0 && (
        <div className="island-shell p-10 rounded-xl text-center bg-white/40">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-200">
            <Link2 size={30} />
          </div>
          <h2 className="text-xl font-bold text-[var(--sea-ink)] mb-1">Knowledge Graph Healthy</h2>
          <p className="text-sm text-[var(--sea-ink-soft)]">All wikilinks are correctly resolved. No broken references found!</p>
        </div>
      )}

      {health && health.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 rise-in">
          {health.map((link) => (
            <article 
              key={link.label}
              className="island-shell p-5 rounded-xl flex flex-col transition-all hover:translate-y-[-2px] bg-white/40"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg border border-amber-100">
                  <FileSearch size={18} />
                </div>
                <div className="text-[10px] font-bold bg-[var(--lagoon)] text-white px-2 py-0.5 rounded-full">
                  {link.count} Broken {link.count === 1 ? 'Link' : 'Links'}
                </div>
              </div>

              <h3 className="text-lg font-bold text-[var(--sea-ink)] mb-1">[[{link.label}]]</h3>
              <p className="text-xs text-[var(--sea-ink-soft)] mb-4 flex-1">
                Referenced in: {link.sourcePaths.map(p => p.split('/').pop()).join(', ')}
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[var(--foam)] text-[var(--sea-ink)] rounded-lg border border-[var(--line)] text-xs font-bold hover:bg-[var(--line)] transition-colors cursor-pointer">
                  <ExternalLink size={14} /> View
                </button>
                <button type="button" className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[var(--lagoon)] text-white rounded-lg text-xs font-bold hover:bg-[var(--lagoon-deep)] transition-colors shadow-sm cursor-pointer">
                  <PlusCircle size={14} /> Create
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
