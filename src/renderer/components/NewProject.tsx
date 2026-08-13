import React, { DragEvent, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, AudioLines, FileAudio, FolderOpen, KeyRound, Settings, ShieldCheck, Sparkles, Video } from 'lucide-react'
import {
  extendVisualScenesAcrossSpeechGaps,
  getProjectDocument,
  useEditorStore,
} from '../../store/useEditorStore'
import { storeAsset } from '../../platform/web/browserAssets'
import ProjectSettingsDialog from './ProjectSettingsDialog'

export default function NewProject() {
  const {
    projectName,
    audioFile,
    setScreen,
    beginProject,
    setScenes,
    setPendingMatches,
    setIsProcessingAudio,
    setProcessingError,
    setProcessingStage,
    setProcessingProgress,
    setEditorNotice,
    apiKeys,
  } = useEditorStore()
  const [name, setName] = useState(projectName || `My video ${new Date().toLocaleDateString()}`)
  const [selectedAudio, setSelectedAudio] = useState(audioFile)
  const [isDragging, setIsDragging] = useState(false)
  const [autoStockEnabled, setAutoStockEnabled] = useState(true)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    window.rhymx.getAppSettings().then((settings) => setAutoStockEnabled(settings.autoStockEnabled))
    window.rhymx.onTranscriptionProgress((progress) => {
      setProcessingProgress({ completed: progress.completed, total: progress.total, matched: 0, message: progress.message })
    })
    window.rhymx.onPexelsAutoMatchProgress((progress) => {
      setProcessingProgress({ completed: progress.completed, total: progress.total, matched: progress.matched, message: 'Searching free media across providers' })
    })
  }, [setProcessingProgress])

  const fileName = useMemo(() => selectedAudio?.path.split(/[\\/]/).pop() || '', [selectedAudio])

  const browse = async () => {
    const file = await window.rhymx.openAudioFile()
    if (file) setSelectedAudio(file)
  }

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files[0]
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'webm'].includes(extension)) {
      alert('Please drop a supported audio file.')
      return
    }
    const imported = await storeAsset(file, 'music')
    setSelectedAudio({ path: imported.path, duration: (await window.rhymx.getMediaDuration(imported.path)) || 0 })
  }

  const createProject = async () => {
    if (!selectedAudio) return
    beginProject(name, selectedAudio)
    setProcessingProgress({ completed: 0, total: 0, matched: 0, message: 'Analyzing voiceover' })
    try {
      const result = await window.rhymx.transcribeAudio(selectedAudio.path)
      const subtitleTimingScenes = result.map((scene, index) => ({ ...scene, id: scene.id || `scene_${index + 1}`, media: scene.media || null }))
      if (subtitleTimingScenes.length === 0) throw new Error('Groq Whisper returned an empty transcript.')
      const measuredDuration = selectedAudio.duration || subtitleTimingScenes.reduce((maximum, scene) => Math.max(maximum, scene.endTimeSec), 0)
      const scenes = extendVisualScenesAcrossSpeechGaps(subtitleTimingScenes, measuredDuration)
      setScenes(scenes, subtitleTimingScenes)

      if (autoStockEnabled) {
        setProcessingStage('matching-stock')
        setProcessingProgress({ completed: 0, total: scenes.length, matched: 0, message: 'Searching free media across providers' })
        const matches = await window.rhymx.autoMatchScenes(scenes)
        setPendingMatches(matches)
        setIsProcessingAudio(false)
        setScreen('approval')
        return
      }

      setEditorNotice('Transcription complete. Your word timing and visual search phrases are ready.')
      setProcessingStage('saving')
      setIsProcessingAudio(false)
      setScreen('editor')
      const project = getProjectDocument()
      if (project) await window.rhymx.saveProject(project)
    } catch (reason) {
      setIsProcessingAudio(false)
      setProcessingError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const goBack = () => {
    setScreen('projects')
    window.history.pushState({}, '', '/app')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  return (
    <div className="min-h-screen bg-[#0b0d12] text-white flex flex-col">
      <header className="h-20 border-b border-white/5 flex items-center justify-between px-5 sm:px-10"><button onClick={goBack} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"><ArrowLeft className="h-4 w-4" />Projects</button><button onClick={() => setShowSettings(true)} className="h-9 px-3 rounded-lg border border-white/8 bg-white/5 hover:bg-white/10 flex items-center gap-2 text-xs text-slate-300"><Settings className="h-3.5 w-3.5" />API keys</button></header>
      <main className="flex-1 flex items-center justify-center p-5 sm:p-8 py-12">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8"><div className="h-12 w-12 rounded-2xl bg-violet-500/15 text-violet-300 flex items-center justify-center mx-auto mb-4"><AudioLines className="h-6 w-6" /></div><h1 className="text-3xl font-semibold tracking-tight">Create from voiceover</h1><p className="text-slate-500 mt-2">Import your narration. Rhymx will build timed scenes, captions, and a visual plan.</p></div>
          <div className="rounded-3xl border border-white/10 bg-[#12141b] p-5 sm:p-7 shadow-2xl shadow-black/30">
            {!apiKeys.groq && <div className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/[.08] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="flex items-start gap-3"><KeyRound className="h-4 w-4 text-amber-300 mt-0.5 shrink-0" /><div><div className="text-xs font-medium text-amber-100">Add a Groq key before creating your first project</div><div className="mt-1 text-[10px] leading-4 text-amber-100/60">Transcription runs from this browser. Pexels, Pixabay, and YouTube keys unlock their matching search features.</div></div></div><button onClick={() => setShowSettings(true)} className="shrink-0 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 px-3 py-2 text-[10px] font-medium text-amber-100">Set up keys</button></div>}
            <label className="block text-xs font-medium text-slate-400 mb-2">Project name<input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0c0e13] px-4 py-3 text-sm outline-none focus:border-violet-500/60" /></label>
            <div onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop} className={`mt-5 rounded-2xl border-2 border-dashed px-8 py-10 text-center transition-colors ${isDragging ? 'border-violet-400 bg-violet-500/10' : selectedAudio ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-white/[0.015]'}`}>
              {selectedAudio ? <><FileAudio className="h-9 w-9 text-emerald-400 mx-auto mb-3" /><div className="font-medium text-sm truncate">{fileName}</div><div className="text-xs text-slate-500 mt-1">Voiceover ready</div></> : <><FolderOpen className="h-9 w-9 text-slate-500 mx-auto mb-3" /><div className="text-sm font-medium">Drag your voiceover here</div><div className="text-xs text-slate-500 mt-1">MP3, WAV, M4A, AAC, FLAC, OGG or WebM</div></>}
              <button onClick={browse} className="mt-5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs transition-colors">{selectedAudio ? 'Choose another file' : 'Browse files'}</button>
            </div>
            <div className="mt-5 rounded-2xl border border-white/8 bg-black/15 p-4"><label className="flex items-center justify-between gap-4"><div className="flex items-start gap-3"><Video className="h-4 w-4 text-violet-400 mt-0.5" /><div><div className="text-xs font-medium text-slate-300">Build a multi-provider visual plan</div><div className="text-[10px] text-slate-600 mt-1 leading-4">Search Pexels, Pixabay, Archive.org, NASA, and Wikimedia, then approve the contact sheet before download.</div></div></div><input type="checkbox" checked={autoStockEnabled} onChange={(event) => { setAutoStockEnabled(event.target.checked); window.rhymx.setAutoStockEnabled(event.target.checked) }} className="h-4 w-4 accent-violet-500" /></label></div>
            <div className="mt-4 rounded-xl border border-emerald-500/15 bg-emerald-500/[.06] p-3 flex items-start gap-2 text-[10px] text-emerald-100/80 leading-4"><ShieldCheck className="h-4 w-4 shrink-0" />Your provider keys stay in this browser profile and are sent only to the provider you invoke. Credentials are never stored in a project or export.</div>
            <button onClick={createProject} disabled={!selectedAudio || !apiKeys.groq} className="mt-6 w-full rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed py-3.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors"><Sparkles className="h-4 w-4" />{selectedAudio && !apiKeys.groq ? 'Add Groq key to continue' : 'Create and transcribe'}</button>
          </div>
        </div>
      </main>
      {showSettings && <ProjectSettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  )
}
