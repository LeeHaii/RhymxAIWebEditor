import React, { useState } from 'react'
import { ChevronLeft, Download, Film, Settings } from 'lucide-react'
import { getProjectDocument, useEditorStore } from '../../store/useEditorStore'

export default function Header() {
  const {
    projectName,
    setProjectName,
    scenes,
    audioFile,
    audioClips,
    subtitleSettings,
    apiKeys,
    setApiKeys,
    closeProject,
    exportProgress,
    setExportProgress,
  } = useEditorStore()
  const [showSettings, setShowSettings] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const goHome = async () => {
    const project = getProjectDocument()
    if (project) await window.electronAPI.saveProject(project)
    closeProject()
  }

  const exportVideo = async () => {
    if (!audioFile) return
    setIsExporting(true)
    setExportProgress(0)
    try {
      await window.electronAPI.exportVideo(
        scenes,
        audioFile.path,
        audioClips,
        subtitleSettings
      )
      alert('Video exported to your Downloads folder.')
    } catch (reason) {
      alert(`Export failed:\n${reason instanceof Error ? reason.message : String(reason)}`)
    } finally {
      setIsExporting(false)
      setExportProgress(null)
    }
  }

  const updateKey = (key: 'gemini' | 'pexels', value: string) => {
    setApiKeys({ [key]: value })
    if (key === 'gemini') window.electronAPI.setGeminiKey(value)
    else window.electronAPI.setPexelsKey(value)
  }

  return (
    <div className="h-14 bg-[#111319] border-b border-white/5 flex items-center justify-between px-3 shrink-0 relative z-[100]">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={goHome}
          className="h-8 px-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white flex items-center gap-1.5 text-xs transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Projects
        </button>
        <div className="h-5 w-px bg-white/10 mx-1" />
        <div className="h-7 w-7 rounded-lg bg-violet-600 flex items-center justify-center">
          <Film className="w-3.5 h-3.5" />
        </div>
        <input
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
          className="bg-transparent hover:bg-white/5 focus:bg-white/5 rounded-lg px-2 py-1 text-sm font-medium outline-none min-w-0 w-56"
          aria-label="Project name"
        />
        <span className="text-[10px] text-slate-600">Autosaved</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={exportVideo}
          disabled={isExporting || scenes.length === 0}
          className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 rounded-lg text-xs font-medium transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          {isExporting ? `Exporting ${Math.round(exportProgress || 0)}%` : 'Export'}
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {showSettings && (
        <div className="absolute top-12 right-3 w-80 bg-[#181a22] border border-white/10 shadow-2xl rounded-xl p-4 z-50">
          <h2 className="font-semibold text-sm text-slate-200 mb-4">API settings</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">Gemini API key</label>
              <input
                type="password"
                className="w-full bg-[#0d0f14] border border-white/10 focus:border-violet-500/50 outline-none rounded-lg p-2.5 text-xs text-slate-300"
                value={apiKeys.gemini}
                onChange={(event) => updateKey('gemini', event.target.value)}
                placeholder="AQ.…"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">Pexels API key</label>
              <input
                type="password"
                className="w-full bg-[#0d0f14] border border-white/10 focus:border-violet-500/50 outline-none rounded-lg p-2.5 text-xs text-slate-300"
                value={apiKeys.pexels}
                onChange={(event) => updateKey('pexels', event.target.value)}
              />
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="w-full bg-white/5 hover:bg-white/10 rounded-lg py-2 text-xs"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
