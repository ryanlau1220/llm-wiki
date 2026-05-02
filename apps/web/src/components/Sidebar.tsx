import { Link, useNavigate } from '@tanstack/react-router'
import { 
  Search, 
  RotateCcw, 
  Link2, 
  Activity, 
  BookOpen, 
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Sparkles,
  ShieldAlert,
  LogOut
} from 'lucide-react'
import { useState } from 'react'
import { orpc } from '../lib/orpc'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const logoutMutation = useMutation(
    orpc.logout.mutationOptions({
      onSuccess: () => {
        queryClient.setQueryData(orpc.me.queryKey(), null)
        navigate({ to: '/login' })
      }
    })
  )

  const navItems = [
    { label: 'Dashboard', icon: Activity, to: '/' },
    { label: 'Ask Knowledge', icon: Search, to: '/ask' },
    { label: 'Refactor Note', icon: RotateCcw, to: '/refactor' },
    { label: 'Synthesis', icon: Sparkles, to: '/synthesis' },
    { label: 'Link Health', icon: Link2, to: '/links' },
    { label: 'Maintenance', icon: ShieldAlert, to: '/maintenance' },
    { label: 'Wiki Pages', icon: BookOpen, to: '/vault' },
  ]

  return (
    <aside 
      className={`fixed left-0 top-0 h-screen bg-[var(--surface-strong)] border-r border-[var(--line)] transition-all duration-300 z-50 flex flex-col ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="p-4 flex items-center justify-between border-b border-[var(--line)]">
        {!isCollapsed && <span className="font-bold text-lg text-[var(--sea-ink)]">LLM Wiki</span>}
        <button 
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded hover:bg-[var(--line)] text-[var(--sea-ink-soft)]"
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-2 px-2">
          {navItems.map((item) => (
            <li key={item.label}>
              <Link
                to={item.to}
                activeProps={{ className: 'bg-[var(--lagoon)] text-white shadow-sm' }}
                inactiveProps={{ className: 'text-[var(--sea-ink-soft)] hover:bg-[var(--line)]' }}
                className={`flex items-center gap-3 p-2 rounded-xl transition-all duration-200 no-underline group ${
                  isCollapsed ? 'justify-center' : ''
                }`}
              >
                <item.icon size={20} className="shrink-0" />
                {!isCollapsed && <span className="font-medium">{item.label}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-[var(--line)] space-y-3">
        <button type="button" className={`w-full flex items-center gap-3 p-2 rounded-xl bg-[var(--sea-ink)] text-white hover:bg-[var(--lagoon-deep)] transition-colors ${
          isCollapsed ? 'justify-center' : ''
        }`}>
          <PlusCircle size={20} />
          {!isCollapsed && <span>New Note</span>}
        </button>
        
        <button 
          type="button" 
          onClick={() => logoutMutation.mutate(undefined)}
          className={`w-full flex items-center gap-3 p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200 ${
          isCollapsed ? 'justify-center' : ''
        }`}>
          <LogOut size={20} />
          {!isCollapsed && <span className="font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  )
}
