import { Link, useNavigate } from '@tanstack/react-router'
import { 
  RotateCcw, 
  Activity, 
  BookOpen, 
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Sparkles,
  LogOut
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { orpc } from '../lib/orpc'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar_collapsed')
      return saved ? JSON.parse(saved) : false
    }
    return false
  })
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
      isCollapsed ? '64px' : '224px'
    )
  }, [isCollapsed])

  const navItems = [
    { label: 'Dashboard', icon: Activity, to: '/' },
    { label: 'AI Generator', icon: Sparkles, to: '/generator' },
    { label: 'Refactor Note', icon: RotateCcw, to: '/refactor' },
    { label: 'Wiki Pages', icon: BookOpen, to: '/vault' },
  ]

  return (
    <aside 
      className={`fixed left-0 top-0 h-screen bg-[var(--surface-strong)] border-r border-[var(--line)] transition-all duration-300 z-50 flex flex-col ${
        isCollapsed ? 'w-16' : 'w-56'
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
                activeProps={{ className: 'bg-foam/80 border-line text-sea-ink font-semibold shadow-sm' }}
                inactiveProps={{ className: 'text-sea-ink-soft hover:bg-foam/50 border-transparent' }}
                className={`flex items-center gap-3 p-2 rounded-xl border transition-all duration-200 no-underline group ${
                  isCollapsed ? 'justify-center' : ''
                }`}
              >
                <item.icon size={18} className="shrink-0" />
                {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-[var(--line)] space-y-2">
        <button 
          type="button" 
          onClick={() => navigate({ to: '/generator' })}
          className={`w-full flex items-center gap-3 p-2 rounded-xl bg-sea-ink text-sand hover:bg-lagoon-deep transition-colors shadow-sm text-sm ${
            isCollapsed ? 'justify-center' : ''
          }`}
        >
          <PlusCircle size={18} />
          {!isCollapsed && <span className="font-bold">New Note</span>}
        </button>
        
        <button 
          type="button" 
          onClick={() => logoutMutation.mutate(undefined)}
          className={`w-full flex items-center gap-3 p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200 text-sm ${
          isCollapsed ? 'justify-center' : ''
        }`}>
          <LogOut size={18} />
          {!isCollapsed && <span className="font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  )
}
