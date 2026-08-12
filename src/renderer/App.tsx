import React, { PointerEvent, useEffect, useState } from 'react'
import Header from './components/Header'
import PlayerCanvas from './components/PlayerCanvas'
import Timeline from './components/Timeline/Timeline'
import ContextInspector from './components/Inspector/ContextInspector'
import ProjectHome from './components/ProjectHome'
import NewProject from './components/NewProject'
import TranscribingScreen from './components/TranscribingScreen'
import MediaBin from './components/MediaBin'
import { getProjectDocument, useEditorStore } from '../store/useEditorStore'

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value))

function EditorWorkspace() {
  const projectUpdatedAt = useEditorStore((state) => state.projectUpdatedAt)
  const projectId = useEditorStore((state) => state.projectId)
  const editorNotice = useEditorStore((state) => state.editorNotice)
  const setEditorNotice = useEditorStore((state) => state.setEditorNotice)
  const [mediaWidth, setMediaWidth] = useState(() =>
    Number(localStorage.getItem('rhymx.mediaWidth') || 256)
  )
  const [inspectorWidth, setInspectorWidth] = useState(() =>
    Number(localStorage.getItem('rhymx.inspectorWidth') || 320)
  )
  const [timelineHeight, setTimelineHeight] = useState(() =>
    Number(localStorage.getItem('rhymx.timelineHeight') || 300)
  )

  useEffect(() => {
    if (!projectId || !projectUpdatedAt) return
    const timer = window.setTimeout(() => {
      const project = getProjectDocument()
      if (project) {
        window.rhymx.saveProject(project).catch((error) => {
          console.error('Autosave failed:', error)
        })
      }
    }, 600)
    return () => window.clearTimeout(timer)
  }, [projectId, projectUpdatedAt])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useEditorStore.getState()
      const key = event.key.toLowerCase()
      const commandKey = event.ctrlKey || event.metaKey
      const target = event.target as HTMLElement | null
      const isEditing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable

      if (commandKey && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (commandKey && key === 'y') {
        event.preventDefault()
        state.redo()
        return
      }
      if (commandKey && key === 's') {
        event.preventDefault()
        const project = getProjectDocument()
        if (project) window.rhymx.saveProject(project)
        return
      }
      if (commandKey && (key === '+' || key === '=' || key === '-' || key === '0')) {
        event.preventDefault()
        window.dispatchEvent(
          new CustomEvent('rhymx:timeline-zoom', {
            detail: {
              action:
                key === '-'
                  ? 'out'
                  : key === '0'
                    ? 'reset'
                    : 'in',
            },
          })
        )
        return
      }
      if (isEditing) return
      if (commandKey && key === 'b') {
        event.preventDefault()
        if (state.activeSceneId) state.splitScene(state.activeSceneId, state.currentTimeSec)
      } else if (event.code === 'Space') {
        event.preventDefault()
        state.requestPlayback('toggle')
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.activeSceneId) state.deleteScene(state.activeSceneId)
        else if (state.activeAudioClipId) state.removeAudioClip(state.activeAudioClipId)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        state.requestSeek(
          Math.max(0, state.currentTimeSec - (event.shiftKey ? 1 : 1 / 30))
        )
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        state.requestSeek(state.currentTimeSec + (event.shiftKey ? 1 : 1 / 30))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    localStorage.setItem('rhymx.mediaWidth', String(mediaWidth))
    localStorage.setItem('rhymx.inspectorWidth', String(inspectorWidth))
    localStorage.setItem('rhymx.timelineHeight', String(timelineHeight))
  }, [mediaWidth, inspectorWidth, timelineHeight])

  const beginResize = (
    event: PointerEvent<HTMLDivElement>,
    direction: 'media' | 'inspector' | 'timeline'
  ) => {
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const initial =
      direction === 'media'
        ? mediaWidth
        : direction === 'inspector'
          ? inspectorWidth
          : timelineHeight

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      if (direction === 'media') {
        setMediaWidth(clamp(initial + moveEvent.clientX - startX, 180, 480))
      } else if (direction === 'inspector') {
        setInspectorWidth(clamp(initial - (moveEvent.clientX - startX), 260, 560))
      } else {
        setTimelineHeight(clamp(initial - (moveEvent.clientY - startY), 210, 520))
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="flex flex-col h-screen bg-[#0b0d12] text-slate-50 overflow-hidden">
      <Header />
      {editorNotice && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[180] w-[min(680px,calc(100%-32px))] rounded-xl border border-violet-500/25 bg-[#1a1824]/95 shadow-2xl px-4 py-3 flex items-start gap-3 text-[11px] text-violet-100">
          <span className="flex-1">{editorNotice}</span>
          <button
            onClick={() => setEditorNotice(null)}
            className="text-violet-300/60 hover:text-white"
          >
            ×
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <MediaBin width={mediaWidth} />
        <div
          onPointerDown={(event) => beginResize(event, 'media')}
          className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-violet-500/70 z-40"
          title="Resize media bin"
        />

        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex-1 min-h-0 bg-[#090a0e] relative p-5">
            <PlayerCanvas />
          </div>
          <div
            onPointerDown={(event) => beginResize(event, 'timeline')}
            className="h-1 shrink-0 cursor-row-resize bg-white/5 hover:bg-violet-500/70 z-40"
            title="Resize timeline"
          />
          <div
            className="shrink-0 bg-[#101218] min-h-0"
            style={{ height: timelineHeight }}
          >
            <Timeline />
          </div>
        </div>

        <div
          onPointerDown={(event) => beginResize(event, 'inspector')}
          className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-violet-500/70 z-40"
          title="Resize inspector"
        />
        <div
          className="shrink-0 bg-[#111319] flex flex-col min-w-0"
          style={{ width: inspectorWidth }}
        >
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
      window.rhymx.getGroqKey(),
      window.rhymx.getPexelsKey(),
      window.rhymx.getYouTubeKey(),
    ]).then(([groq, pexels, youtube]) => {
      setApiKeys({
        groq: groq || '',
        pexels: pexels || '',
        youtube: youtube || '',
      })
    })
  }, [setApiKeys])

  if (screen === 'projects') return <ProjectHome />
  if (screen === 'new-project') return <NewProject />
  if (screen === 'transcribing') return <TranscribingScreen />
  return <EditorWorkspace />
}

export default App
