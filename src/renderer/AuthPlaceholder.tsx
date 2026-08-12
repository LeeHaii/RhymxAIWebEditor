import React, { FormEvent, useState } from 'react'
import { ArrowRight, CheckCircle2, Film, LockKeyhole } from 'lucide-react'
import { RouteLink, navigate } from './routing'

export interface AuthContextValue {
  status: 'guest'
  actorId: string
}

export interface AuthProvider {
  getContext(): Promise<AuthContextValue>
  login?(): Promise<never>
  signup?(): Promise<never>
}

export default function AuthPlaceholder({ mode }: { mode: 'login' | 'signup' }) {
  const [notice, setNotice] = useState(false)
  const [password, setPassword] = useState('')
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPassword('')
    setNotice(true)
  }
  const signup = mode === 'signup'

  return (
    <main className="public-shell min-h-screen text-white grid lg:grid-cols-2">
      <section className="hidden lg:flex p-12 xl:p-20 flex-col justify-between border-r border-white/10 bg-[radial-gradient(circle_at_25%_20%,rgba(124,58,237,.28),transparent_38%),#090a0e]">
        <RouteLink href="/" className="inline-flex items-center gap-3 font-semibold text-lg"><span className="h-10 w-10 rounded-xl bg-violet-600 flex items-center justify-center"><Film className="h-5 w-5" /></span>Rhymx</RouteLink>
        <div className="max-w-lg"><div className="text-violet-300 text-xs uppercase tracking-[.22em]">Local-first by design</div><h1 className="text-5xl font-semibold tracking-[-.04em] mt-5 leading-[1.05]">Your story stays yours.</h1><p className="mt-6 text-lg text-slate-400 leading-relaxed">Guest projects live in browser storage. Add an account later when cloud sync is ready—not before you need it.</p></div>
        <p className="text-xs text-slate-600">No password is sent or stored on this preview screen.</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10 bg-[#0b0d12]">
        <div className="w-full max-w-md">
          <RouteLink href="/" className="lg:hidden inline-flex items-center gap-2 mb-12 font-semibold"><Film className="h-5 w-5 text-violet-400" />Rhymx</RouteLink>
          <div className="h-12 w-12 rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-300 flex items-center justify-center"><LockKeyhole className="h-5 w-5" /></div>
          <h1 className="text-3xl font-semibold tracking-tight mt-6">{signup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="text-sm text-slate-500 mt-2">Accounts are coming soon. You can use the complete guest editor today.</p>
          {notice && <div role="status" className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 flex items-start gap-2 text-xs text-emerald-100"><CheckCircle2 className="h-4 w-4 shrink-0" />Accounts are not enabled yet. Nothing was submitted or saved.</div>}
          <form onSubmit={submit} className="mt-7 space-y-4">
            {signup && <label className="block text-xs text-slate-400">Name<input autoComplete="name" className="mt-2 w-full rounded-xl border border-white/10 bg-[#111319] px-4 py-3 text-sm outline-none focus:border-violet-500/60" /></label>}
            <label className="block text-xs text-slate-400">Email<input type="email" autoComplete="email" className="mt-2 w-full rounded-xl border border-white/10 bg-[#111319] px-4 py-3 text-sm outline-none focus:border-violet-500/60" /></label>
            <label className="block text-xs text-slate-400">Password<input type="password" autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#111319] px-4 py-3 text-sm outline-none focus:border-violet-500/60" /></label>
            {signup && <label className="flex items-start gap-2 text-[11px] text-slate-500"><input type="checkbox" className="mt-0.5 accent-violet-500" />I’ll review the Terms and Privacy Policy when accounts launch.</label>}
            <button className="w-full rounded-xl bg-white text-slate-950 hover:bg-violet-100 py-3 text-sm font-semibold">{signup ? 'Create account' : 'Login'}</button>
          </form>
          <button onClick={() => navigate('/app')} className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 py-3 text-sm flex items-center justify-center gap-2">{signup ? 'Start without an account' : 'Continue as guest'}<ArrowRight className="h-4 w-4" /></button>
          <p className="mt-6 text-xs text-slate-500 text-center">{signup ? 'Already have a future account?' : 'New to Rhymx?'} <RouteLink href={signup ? '/login' : '/signup'} className="text-violet-300 hover:text-violet-200">{signup ? 'Login' : 'Sign up'}</RouteLink></p>
        </div>
      </section>
    </main>
  )
}

