import { HeadContent, Scripts, createRootRouteWithContext, useLocation } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from '../components/Sidebar'
import appCss from '../styles.css?url'

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`

interface MyRouterContext {
  queryClient: QueryClient
  user: { email: string; role: string } | null
}

import { orpc } from '../lib/orpc'
import { redirect } from '@tanstack/react-router'

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async ({ context, location }) => {
    const user = await context.queryClient.ensureQueryData(
      orpc.me.queryOptions()
    )
    
    if (!user && location.pathname !== '/login') {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.pathname,
        },
      })
    }

    return { user }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'LLM Wiki Dashboard' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center bg-[var(--foam)] p-8">
      <div className="island-shell p-12 rounded-[3rem] text-center max-w-md shadow-2xl">
        <h1 className="display-title text-6xl font-bold text-[var(--sea-ink)] mb-4">404</h1>
        <p className="text-[var(--sea-ink-soft)] text-lg mb-8">This branch of knowledge doesn't exist yet.</p>
        <button 
          type="button"
          onClick={() => window.location.href = '/'}
          className="px-8 py-3 bg-[var(--lagoon)] text-white font-bold rounded-2xl hover:bg-[var(--lagoon-deep)] transition-all"
        >
          Return Home
        </button>
      </div>
    </div>
  ),
  errorComponent: ({ error }: any) => (
    <div className="min-h-screen flex items-center justify-center bg-red-50 p-8">
      <div className="bg-white p-12 rounded-[3rem] text-center max-w-xl shadow-2xl border-2 border-red-100">
        <h1 className="text-4xl font-bold text-red-600 mb-4">System Error</h1>
        <p className="text-red-500 mb-8 font-mono text-sm bg-red-50 p-4 rounded-xl text-left">
          {error?.message || 'An unexpected error occurred.'}
        </p>
        <button 
          type="button"
          onClick={() => window.location.reload()}
          className="px-8 py-3 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 transition-all"
        >
          Retry Connection
        </button>
      </div>
    </div>
  ),
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { queryClient } = Route.useRouteContext()
  const { pathname } = useLocation()
  const isLoginPage = pathname === '/login'

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Theme init script prevents FOUC */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-[rgba(79,184,178,0.24)]">
        <QueryClientProvider client={queryClient}>
          <div className="flex">
            {!isLoginPage && <Sidebar />}
            <main className={`flex-1 transition-all duration-300 ${isLoginPage ? '' : 'ml-16 sm:ml-16 md:ml-64'}`}>
              <div className="min-h-screen relative z-10">
                {children}
              </div>
            </main>
          </div>
          <TanStackDevtools
            config={{ position: 'bottom-right' }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
