import React, { useEffect, useState } from 'react'
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

  useEffect(() => {
    const onRoute = () => setRouteVersion((current) => current + 1)
    window.addEventListener('popstate', onRoute)
    return () => window.removeEventListener('popstate', onRoute)
  }, [])

  useEffect(() => {
    const match = window.location.pathname.match(/^\/app\/project\/([^/]+)$/)
    if (match && match[1] !== projectId) {
      window.rhymx.loadProject(decodeURIComponent(match[1])).then(loadProject).catch(() => {
        window.history.replaceState({}, '', '/app')
        setScreen('projects')
      })
      return
    }
    if (window.location.pathname === '/app/new' && screen !== 'new-project' && screen !== 'transcribing' && screen !== 'approval') {
      setScreen('new-project')
    }
    if (window.location.pathname === '/app' && screen !== 'projects') setScreen('projects')
  }, [loadProject, projectId, routeVersion, screen, setScreen])

  useEffect(() => {
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

