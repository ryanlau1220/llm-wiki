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

export default function ThemeToggle() {
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
      className="absolute top-6 right-8 z-40 p-3 rounded-full border border-line bg-surface-strong text-sea-ink hover:bg-foam hover:scale-105 active:scale-95 transition-all shadow-md flex items-center justify-center cursor-pointer"
    >
      <Icon size={20} className="text-sea-ink-soft shrink-0" />
    </button>
  )
}
