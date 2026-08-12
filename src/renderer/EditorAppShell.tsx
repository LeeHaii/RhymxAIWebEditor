import React, { useEffect, useRef, useState } from 'react'
import App from './App'
import { installBrowserPlatform } from '../platform/web/browserPlatform'
import { useEditorStore } from '../store/useEditorStore'

installBrowserPlatform()

export default function EditorAppShell() {
  const screen = useEditorStore((state) => state.screen)
  const projectId = useEditorStore((state) => state.projectId)
  const setScreen = useEditorStore((state) => state.setScreen)
  const loadProject = useEditorStore((state) => state.loadProject)
  const [routeVersion, setRouteVersion] = useState(0)
  const applyingRoute = useRef(false)

  useEffect(() => {
    const onRoute = () => setRouteVersion((current) => current + 1)
    window.addEventListener('popstate', onRoute)
    return () => window.removeEventListener('popstate', onRoute)
  }, [])

  useEffect(() => {
    const state = useEditorStore.getState()
    const match = window.location.pathname.match(/^\/app\/project\/([^/]+)$/)
    if (match && match[1] !== state.projectId) {
      applyingRoute.current = true
      window.rhymx.loadProject(decodeURIComponent(match[1])).then(loadProject).catch(() => {
        window.history.replaceState({}, '', '/app')
        setScreen('projects')
      })
      return
    }
    if (
      window.location.pathname === '/app/new' &&
      state.screen !== 'new-project' &&
      state.screen !== 'transcribing' &&
      state.screen !== 'approval'
    ) {
      applyingRoute.current = true
      setScreen('new-project')
    }
    if (window.location.pathname === '/app' && state.screen !== 'projects') {
      applyingRoute.current = true
      setScreen('projects')
    }
  }, [loadProject, routeVersion, setScreen])

  useEffect(() => {
    if (applyingRoute.current) {
      applyingRoute.current = false
      return
    }
    const desired = screen === 'projects'
      ? '/app'
      : screen === 'new-project'
        ? '/app/new'
        : screen === 'editor' && projectId
          ? `/app/project/${encodeURIComponent(projectId)}`
          : window.location.pathname
    if (desired !== window.location.pathname) window.history.pushState({}, '', desired)
  }, [projectId, screen])

  return <App />
}
