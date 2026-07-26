import { Link, useNavigate } from '@tanstack/react-router'
import { 
  RotateCcw, 
  Activity, 
  BookOpen, 
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Sparkles,
  LogOut,
  Settings,
  Inbox,
  ListTree,
  ListChecks,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { orpc } from '../lib/orpc'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import ThemeToggle from './ThemeToggle'
import { useMediaQuery } from '../lib/useMediaQuery'

export function Sidebar({ isMobileOpen, onClose }: { isMobileOpen: boolean; onClose: () => void }) {
  const isMobile = useMediaQuery('(max-width: 1024px)')
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed')
    if (saved) {
      setIsCollapsed(JSON.parse(saved))
    }
  }, [])
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const logoutMutation = useMutation(
    orpc.logout.mutationOptions({
      onSuccess: () => {
        localStorage.removeItem('llm_wiki_token');
        queryClient.removeQueries({ queryKey: orpc.me.queryKey() });
        navigate({ to: '/login' });
      }
    })
  )

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-width',
      isMobile ? '0px' : (isCollapsed ? '64px' : '224px')
    )
  }, [isCollapsed, isMobile])

  const navItems = [
    { label: 'Dashboard', icon: Activity, to: '/' },
    { label: 'AI Generator', icon: Sparkles, to: '/generator' },
    { label: 'Refactor Note', icon: RotateCcw, to: '/refactor' },
    { label: 'Research Inbox', icon: Inbox, to: '/research' },
    { label: 'Organization Review', icon: ListChecks, to: '/organization' },
    { label: 'Retrieval Traces', icon: ListTree, to: '/retrieval' },
    { label: 'Wiki Pages', icon: BookOpen, to: '/vault' },
    { label: 'Settings', icon: Settings, to: '/settings' },
  ]

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobile && isMobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar drawer"
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity duration-300 border-none outline-none cursor-default"
          onClick={onClose}
        />
      )}
      <aside 
        className={`fixed left-0 top-0 h-screen bg-[var(--surface-strong)] border-r border-[var(--line)] transition-all duration-300 z-50 flex flex-col ${
          isCollapsed ? 'lg:w-16 w-56' : 'w-56'
        } ${
          isMobile
            ? isMobileOpen ? 'translate-x-0' : '-translate-x-full'
            : 'translate-x-0'
        }`}
      >
      <div className="p-4 flex items-center justify-between border-b border-[var(--line)]">
        {!isCollapsed && <span className="font-bold text-lg text-[var(--sea-ink)]">LLM Wiki</span>}
        <button 
          type="button"
          onClick={() => {
            setIsCollapsed((prev: boolean) => {
              const next = !prev
              localStorage.setItem('sidebar_collapsed', JSON.stringify(next))
              return next
            })
          }}
          className="p-1 rounded hover:bg-[var(--line)] text-[var(--sea-ink-soft)]"
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => (
            <li key={item.label}>
              <Link
                to={item.to}
                onClick={() => {
                  if (isMobile) onClose()
                }}
                activeProps={{ className: 'bg-foam/80 border-line text-sea-ink font-semibold shadow-sm' }}
                inactiveProps={{ className: 'text-sea-ink-soft hover:bg-foam/50 border-transparent' }}
                className={`flex items-center gap-3 p-2 rounded-xl border transition-all duration-200 no-underline group ${
                  isCollapsed ? 'lg:justify-center' : ''
                }`}
              >
                <item.icon size={18} className="shrink-0" />
                {(isMobile || !isCollapsed) && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-[var(--line)] space-y-2">
        <ThemeToggle collapsed={isCollapsed} />
        
        <button 
          type="button" 
          onClick={() => {
            navigate({ to: '/generator' })
            if (isMobile) onClose()
          }}
          className={`w-full flex items-center gap-3 p-2 rounded-xl bg-sea-ink text-sand hover:bg-lagoon-deep transition-colors shadow-sm text-sm ${
            isCollapsed ? 'lg:justify-center' : ''
          }`}
        >
          <PlusCircle size={18} />
          {(isMobile || !isCollapsed) && <span className="font-bold">New Note</span>}
        </button>
        
        <button 
          type="button" 
          onClick={() => {
            logoutMutation.mutate(undefined)
            if (isMobile) onClose()
          }}
          className={`w-full flex items-center gap-3 p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200 text-sm ${
            isCollapsed ? 'lg:justify-center' : ''
          }`}
        >
          <LogOut size={18} />
          {(isMobile || !isCollapsed) && <span className="font-medium">Logout</span>}
        </button>
      </div>
    </aside>
    </>
  )
}
