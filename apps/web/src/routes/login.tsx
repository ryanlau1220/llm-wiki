import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { orpc } from '../lib/orpc'
import { useState } from 'react'
import { Shield, Lock, Mail, ArrowRight, Loader2 } from 'lucide-react'

export const Route = createFileRoute('/login')({
  component: LoginComponent,
})

function LoginComponent() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@llmwiki.local')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loginMutation = orpc.login.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        navigate({ to: '/' })
      } else {
        setError('Invalid credentials. Please try again.')
      }
      setIsLoading(false)
    },
    onError: (err) => {
      setError(err.message || 'An error occurred during login.')
      setIsLoading(false)
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    loginMutation.mutate({ email, password })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--foam)] p-6">
      <div className="w-full max-w-md">
        <div className="island-shell p-8 rounded-[2.5rem] border-2 border-[var(--lagoon)] shadow-2xl relative overflow-hidden">
          {/* Decorative background elements */}
          <div className="absolute top-[-20%] right-[-20%] w-64 h-64 bg-[var(--lagoon)] opacity-5 blur-[80px] rounded-full" />
          <div className="absolute bottom-[-20%] left-[-20%] w-64 h-64 bg-[var(--sea-ink)] opacity-5 blur-[80px] rounded-full" />

          <header className="text-center mb-8 relative z-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-[var(--surface-strong)] border border-[var(--line)] shadow-sm mb-6">
              <Shield size={32} className="text-[var(--lagoon-deep)]" />
            </div>
            <h1 className="display-title text-4xl font-bold text-[var(--sea-ink)] mb-2">Welcome Back</h1>
            <p className="text-[var(--sea-ink-soft)] font-medium">Access your knowledge engine</p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <div className="space-y-4">
              <div className="group">
                <label className="block text-xs font-bold uppercase tracking-widest text-[var(--sea-ink-soft)] mb-2 ml-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--sea-ink-soft)] transition-colors group-focus-within:text-[var(--lagoon-deep)]" size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] transition-all"
                    placeholder="name@example.com"
                    required
                  />
                </div>
              </div>

              <div className="group">
                <label className="block text-xs font-bold uppercase tracking-widest text-[var(--sea-ink-soft)] mb-2 ml-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--sea-ink-soft)] transition-colors group-focus-within:text-[var(--lagoon-deep)]" size={18} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 rounded-2xl bg-[var(--surface-strong)] border border-[var(--line)] text-[var(--sea-ink)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--lagoon)] transition-all"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-4 rounded-2xl bg-red-50 border border-red-100 flex items-center gap-3 text-red-700 text-sm font-medium">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 rounded-2xl bg-[var(--sea-ink)] text-white font-bold flex items-center justify-center gap-2 hover:bg-[var(--sea-ink-soft)] transition-all disabled:opacity-50 shadow-lg shadow-[var(--sea-ink-soft)]/20 active:scale-[0.98]"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  Sign In to Wiki
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>

          <footer className="mt-8 pt-6 border-t border-[var(--line)] text-center relative z-10">
            <p className="text-xs text-[var(--sea-ink-soft)] font-medium">
              Sovereign Local Knowledge Engine v1.0
            </p>
          </footer>
        </div>
      </div>
    </div>
  )
}
