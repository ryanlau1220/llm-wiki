import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

type ThemeMode = 'light' | 'dark'

function getInitialMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const stored = window.localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark') {
    return stored
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

function applyThemeMode(mode: ThemeMode) {
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(mode)
  document.documentElement.setAttribute('data-theme', mode)
  document.documentElement.style.colorScheme = mode
}

interface ThemeToggleProps {
  collapsed?: boolean
}

export default function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
  const [mode, setMode] = useState<ThemeMode>('light')

  useEffect(() => {
    const initialMode = getInitialMode()
    setMode(initialMode)
    applyThemeMode(initialMode)
  }, [])

  function toggleMode() {
    const nextMode: ThemeMode = mode === 'light' ? 'dark' : 'light'
    setMode(nextMode)
    applyThemeMode(nextMode)
    window.localStorage.setItem('theme', nextMode)
  }

  const Icon = mode === 'light' ? Moon : Sun
  const label = mode === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={label}
      title={label}
      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border border-line bg-surface-strong text-sea-ink hover:bg-foam transition-all text-sm cursor-pointer hover:scale-[1.01] active:scale-[0.99] shadow-sm shrink-0 ${
        collapsed ? 'justify-center' : ''
      }`}
    >
      <Icon size={18} className="text-sea-ink-soft shrink-0" />
      {!collapsed && <span className="font-semibold text-sea-ink-soft">{mode === 'light' ? 'Dark Mode' : 'Light Mode'}</span>}
    </button>
  )
}
