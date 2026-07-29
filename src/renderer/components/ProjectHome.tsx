import React, { useEffect, useState } from 'react'
import { Clock3, Film, FolderOpen, Plus, Sparkles } from 'lucide-react'
import { ProjectSummary } from '../../types/editor'
import { useEditorStore } from '../../store/useEditorStore'

export default function ProjectHome() {
  const { setScreen, loadProject } = useEditorStore()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI
      .listProjects()
      .then(setProjects)
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setIsLoading(false))
  }, [])

  const openProject = async (projectId: string) => {
    setOpeningId(projectId)
    setError(null)
    try {
      loadProject(await window.electronAPI.loadProject(projectId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d12] text-white">
      <header className="h-20 border-b border-white/5 bg-[#101218]/90 flex items-center px-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-950/40">
            <Film className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold tracking-tight">Rhymx Studio</div>
            <div className="text-[11px] text-slate-500">AI video editor</div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-10 py-12">
        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#171923] to-[#101117] p-10 relative overflow-hidden">
          <div className="absolute -right-28 -top-32 h-80 w-80 rounded-full bg-violet-600/15 blur-3xl" />
          <div className="relative max-w-2xl">
            <div className="flex items-center gap-2 text-violet-300 text-xs font-medium uppercase tracking-[0.18em] mb-4">
              <Sparkles className="h-4 w-4" />
              Voiceover to video
            </div>
            <h1 className="text-4xl font-semibold tracking-tight mb-3">What will you create today?</h1>
            <p className="text-slate-400 text-base leading-relaxed mb-7">
              Start with a voiceover. Rhymx transcribes it into timed scenes, then gives you a full
              timeline for footage, sound, and subtitles.
            </p>
            <button
              onClick={() => setScreen('new-project')}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-5 py-3 text-sm font-medium transition-colors shadow-lg shadow-violet-950/40"
            >
              <Plus className="h-4 w-4" />
              Create new project
            </button>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold">Recent projects</h2>
              <p className="text-sm text-slate-500 mt-1">Continue where you left off.</p>
            </div>
            <span className="text-xs text-slate-600">{projects.length} projects</span>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="h-44 rounded-2xl border border-white/5 bg-white/[0.02] animate-pulse" />
          ) : projects.length === 0 ? (
            <button
              onClick={() => setScreen('new-project')}
              className="w-full h-48 rounded-2xl border border-dashed border-white/10 hover:border-violet-500/40 hover:bg-violet-500/[0.03] flex flex-col items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
            >
              <FolderOpen className="h-8 w-8 mb-3" />
              <span className="text-sm">No projects yet — create your first one</span>
            </button>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => openProject(project.id)}
                  disabled={openingId !== null}
                  className="group text-left rounded-2xl border border-white/8 bg-[#12141b] hover:bg-[#171923] hover:border-violet-500/30 overflow-hidden transition-all disabled:opacity-60"
                >
                  <div className="h-32 bg-gradient-to-br from-slate-900 to-violet-950/30 flex items-center justify-center border-b border-white/5">
                    <Film className="h-9 w-9 text-violet-400/60 group-hover:scale-110 transition-transform" />
                  </div>
                  <div className="p-4">
                    <div className="font-medium truncate">
                      {openingId === project.id ? 'Opening…' : project.name}
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-3">
                      <span className="flex items-center gap-1.5">
                        <Clock3 className="h-3 w-3" />
                        {new Date(project.updatedAt).toLocaleDateString()}
                      </span>
                      <span>{project.sceneCount} scenes</span>
                      <span>{Math.round(project.duration)}s</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
