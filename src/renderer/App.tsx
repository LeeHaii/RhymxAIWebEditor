import React, { useEffect } from 'react'
import Header from './components/Header'
import PlayerCanvas from './components/PlayerCanvas'
import Timeline from './components/Timeline/Timeline'
import ContextInspector from './components/Inspector/ContextInspector'
import ProjectHome from './components/ProjectHome'
import NewProject from './components/NewProject'
import TranscribingScreen from './components/TranscribingScreen'
import MediaBin from './components/MediaBin'
import { getProjectDocument, useEditorStore } from '../store/useEditorStore'

function EditorWorkspace() {
  const projectUpdatedAt = useEditorStore((state) => state.projectUpdatedAt)
  const projectId = useEditorStore((state) => state.projectId)

  useEffect(() => {
    if (!projectId || !projectUpdatedAt) return
    const timer = window.setTimeout(() => {
      const project = getProjectDocument()
      if (project) {
        window.electronAPI.saveProject(project).catch((error) => {
          console.error('Autosave failed:', error)
        })
      }
    }, 600)
    return () => window.clearTimeout(timer)
  }, [projectId, projectUpdatedAt])

  return (
    <div className="flex flex-col h-screen bg-[#0b0d12] text-slate-50 overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <MediaBin />
        <div className="flex flex-col flex-1 min-w-0 border-r border-white/5">
          <div className="flex-1 min-h-0 bg-[#090a0e] flex items-center justify-center relative p-5">
            <PlayerCanvas />
          </div>
          <div className="h-[300px] shrink-0 border-t border-white/5 bg-[#101218]">
            <Timeline />
          </div>
        </div>
        <div className="w-80 shrink-0 bg-[#111319] flex flex-col">
          <ContextInspector />
        </div>
      </div>
    </div>
  )
}

function App() {
  const screen = useEditorStore((state) => state.screen)
  const setApiKeys = useEditorStore((state) => state.setApiKeys)

  useEffect(() => {
    Promise.all([
      window.electronAPI.getGeminiKey(),
      window.electronAPI.getPexelsKey(),
    ]).then(([gemini, pexels]) => {
      setApiKeys({ gemini: gemini || '', pexels: pexels || '' })
    })
  }, [setApiKeys])

  if (screen === 'projects') return <ProjectHome />
  if (screen === 'new-project') return <NewProject />
  if (screen === 'transcribing') return <TranscribingScreen />
  return <EditorWorkspace />
}

export default App
