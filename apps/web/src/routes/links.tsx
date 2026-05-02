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
    <div className="p-8 max-w-6xl mx-auto">
      <header className="mb-12">
        <h1 className="display-title text-4xl font-bold text-[var(--sea-ink)] mb-2">Link Health</h1>
        <p className="text-[var(--sea-ink-soft)] text-lg">Identify and fix broken wikilinks across your knowledge base.</p>
      </header>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--sea-ink-soft)]">
          <Loader2 className="animate-spin mb-4" size={48} />
          <p>Analyzing knowledge graph...</p>
        </div>
      )}

      {isError && (
        <div className="p-8 bg-red-50 border border-red-100 rounded-3xl text-center">
          <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
          <h2 className="text-xl font-bold text-red-700 mb-2">Analysis Failed</h2>
          <p className="text-red-600">We couldn't retrieve the link health data. Is the API running?</p>
        </div>
      )}

      {health && health.length === 0 && (
        <div className="island-shell p-12 rounded-[3rem] text-center">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Link2 size={40} />
          </div>
          <h2 className="text-2xl font-bold text-[var(--sea-ink)] mb-2">Knowledge Graph Healthy</h2>
          <p className="text-[var(--sea-ink-soft)]">All wikilinks are correctly resolved. No broken references found!</p>
        </div>
      )}

      {health && health.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 rise-in">
          {health.map((link) => (
            <article 
              key={link.label}
              className="island-shell p-6 rounded-[2rem] flex flex-col transition-all hover:translate-y-[-4px]"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                  <FileSearch size={24} />
                </div>
                <div className="text-xs font-bold bg-[var(--lagoon)] text-white px-2.5 py-1 rounded-full">
                  {link.count} Broken {link.count === 1 ? 'Link' : 'Links'}
                </div>
              </div>

              <h3 className="text-xl font-bold text-[var(--sea-ink)] mb-2">[[{link.label}]]</h3>
              <p className="text-sm text-[var(--sea-ink-soft)] mb-6 flex-1">
                Referenced in: {link.sourcePaths.map(p => p.split('/').pop()).join(', ')}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button type="button" className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[var(--foam)] text-[var(--sea-ink)] rounded-xl border border-[var(--line)] text-sm font-bold hover:bg-[var(--line)] transition-colors">
                  <ExternalLink size={16} /> View
                </button>
                <button type="button" className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[var(--lagoon)] text-white rounded-xl text-sm font-bold hover:bg-[var(--lagoon-deep)] transition-colors shadow-sm">
                  <PlusCircle size={16} /> Create
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
