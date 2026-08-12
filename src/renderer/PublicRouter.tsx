import React, { Component, ErrorInfo, ReactNode, Suspense, lazy, useEffect, useState } from 'react'
import LandingPage from './LandingPage'
import AuthPlaceholder from './AuthPlaceholder'
import LegalPage from './LegalPage'
import { RouteLink } from './routing'

const EditorAppShell = lazy(() => import('./EditorAppShell'))

function EditorLoading() {
  return <div className="min-h-screen bg-[#0b0d12] text-white flex items-center justify-center"><div className="text-center"><div className="mx-auto h-8 w-8 rounded-xl border-2 border-violet-400/30 border-t-violet-400 animate-spin" /><p className="mt-4 text-xs text-slate-500">Opening your local workspace…</p></div></div>
}

class EditorErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Rhymx editor failed to render.', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="min-h-screen bg-[#0b0d12] text-white flex items-center justify-center p-6 text-center">
        <div className="max-w-md rounded-3xl border border-white/10 bg-[#111319] p-8">
          <h1 className="text-xl font-semibold">The editor needs a fresh start.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Your local projects are safe. Reload the workspace to reconnect the editor.
          </p>
          <button
            onClick={() => window.location.assign('/app')}
            className="mt-6 rounded-xl bg-violet-600 hover:bg-violet-500 px-5 py-3 text-sm font-medium"
          >
            Reload workspace
          </button>
        </div>
      </main>
    )
  }
}

export default function PublicRouter() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onRoute = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onRoute)
    return () => window.removeEventListener('popstate', onRoute)
  }, [])

  if (path === '/') return <LandingPage />
  if (path === '/login') return <AuthPlaceholder mode="login" />
  if (path === '/signup') return <AuthPlaceholder mode="signup" />
  if (path === '/privacy') return <LegalPage type="privacy" />
  if (path === '/terms') return <LegalPage type="terms" />
  if (path === '/app' || path.startsWith('/app/')) {
    return (
      <EditorErrorBoundary>
        <Suspense fallback={<EditorLoading />}><EditorAppShell /></Suspense>
      </EditorErrorBoundary>
    )
  }
  return <main className="public-shell min-h-screen bg-[#0b0d12] text-white flex items-center justify-center p-6 text-center"><div><div className="text-7xl font-semibold tracking-tight text-violet-400">404</div><h1 className="mt-4 text-2xl font-semibold">This cut is not on the timeline.</h1><RouteLink href="/" className="mt-7 inline-block rounded-full bg-white text-black px-5 py-3 text-sm font-medium">Return home</RouteLink></div></main>
}
