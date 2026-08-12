import React from 'react'
import { Film } from 'lucide-react'
import { RouteLink } from './routing'

export default function LegalPage({ type }: { type: 'privacy' | 'terms' }) {
  const privacy = type === 'privacy'
  return <main className="public-shell min-h-screen bg-[#0b0d12] text-white"><header className="h-20 border-b border-white/8 flex items-center justify-between px-6 sm:px-10"><RouteLink href="/" className="flex items-center gap-2 font-semibold"><Film className="h-5 w-5 text-violet-400" />Rhymx</RouteLink><RouteLink href="/app" className="text-xs text-slate-400 hover:text-white">Open editor</RouteLink></header><article className="max-w-3xl mx-auto px-6 py-20"><div className="text-xs uppercase tracking-[.22em] text-violet-300">Placeholder policy</div><h1 className="text-5xl font-semibold tracking-tight mt-4">{privacy ? 'Privacy' : 'Terms'}</h1><p className="mt-7 text-slate-400 leading-7">{privacy ? 'Rhymx guest projects, imported narration, and acquired media are stored locally in your browser. Account storage and cloud synchronization are not enabled. Provider requests may process search terms and narration through configured services; production policy details will be published before accounts launch.' : 'Rhymx is currently offered as a guest-mode product preview. You are responsible for reviewing source licenses and usage restrictions before publishing. Rhymx tracks attribution details but cannot guarantee commercial rights for third-party media.'}</p><p className="mt-5 text-slate-500 leading-7">This page is a product placeholder and is not a substitute for a finalized legal policy.</p></article></main>
}

