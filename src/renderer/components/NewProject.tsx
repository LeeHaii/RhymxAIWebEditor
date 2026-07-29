import React, { DragEvent, useMemo, useState } from 'react'
import { ArrowLeft, AudioLines, FileAudio, FolderOpen, KeyRound, Sparkles } from 'lucide-react'
import { getProjectDocument, useEditorStore } from '../../store/useEditorStore'

type FileWithPath = File & { path?: string }

export default function NewProject() {
  const {
    projectName,
    audioFile,
    apiKeys,
    setApiKeys,
    setScreen,
    beginProject,
    setScenes,
    setIsProcessingAudio,
    setProcessingError,
  } = useEditorStore()
  const [name, setName] = useState(projectName || `My video ${new Date().toLocaleDateString()}`)
  const [selectedAudio, setSelectedAudio] = useState(audioFile)
  const [isDragging, setIsDragging] = useState(false)

  const fileName = useMemo(
    () => selectedAudio?.path.split(/[\\/]/).pop() || '',
    [selectedAudio]
  )

  const browse = async () => {
    const file = await window.electronAPI.openAudioFile()
    if (file) setSelectedAudio(file)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files[0] as FileWithPath | undefined
    if (!file?.path) return
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'webm'].includes(extension)) {
      alert('Please drop a supported audio file.')
      return
    }
    setSelectedAudio({ path: file.path, duration: 0 })
  }

  const createProject = async () => {
    if (!selectedAudio) {
      alert('Choose a voiceover first.')
      return
    }
    if (!apiKeys.gemini.trim()) {
      alert('Enter a Gemini API key to transcribe your voiceover.')
      return
    }

    await window.electronAPI.setGeminiKey(apiKeys.gemini.trim())
    beginProject(name, selectedAudio)

    try {
      const result = await window.electronAPI.transcribeAudio(selectedAudio.path, apiKeys.gemini)
      const scenes = result.map((scene, index) => ({
        ...scene,
        id: scene.id || `scene_${index + 1}`,
        media: scene.media || null,
      }))
      if (scenes.length === 0) {
        throw new Error('Gemini returned an empty transcript.')
      }
      setScenes(scenes)
      setIsProcessingAudio(false)
      setScreen('editor')
      const project = getProjectDocument()
      if (project) await window.electronAPI.saveProject(project)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setIsProcessingAudio(false)
      setProcessingError(message)
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d12] text-white flex flex-col">
      <header className="h-20 border-b border-white/5 flex items-center px-10">
        <button
          onClick={() => setScreen('projects')}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Projects
        </button>
      </header>

      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="h-12 w-12 rounded-2xl bg-violet-500/15 text-violet-300 flex items-center justify-center mx-auto mb-4">
              <AudioLines className="h-6 w-6" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Create from voiceover</h1>
            <p className="text-slate-500 mt-2">
              Import narration and Rhymx will build timed scenes and subtitles.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#12141b] p-6">
            <label className="block text-xs font-medium text-slate-400 mb-2">Project name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0c0e13] px-4 py-3 text-sm outline-none focus:border-violet-500/60 mb-5"
            />

            <div
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`rounded-2xl border-2 border-dashed px-8 py-10 text-center transition-colors ${
                isDragging
                  ? 'border-violet-400 bg-violet-500/10'
                  : selectedAudio
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-white/10 bg-white/[0.015]'
              }`}
            >
              {selectedAudio ? (
                <>
                  <FileAudio className="h-9 w-9 text-emerald-400 mx-auto mb-3" />
                  <div className="font-medium text-sm truncate">{fileName}</div>
                  <div className="text-xs text-slate-500 mt-1">Voiceover ready</div>
                </>
              ) : (
                <>
                  <FolderOpen className="h-9 w-9 text-slate-500 mx-auto mb-3" />
                  <div className="text-sm font-medium">Drag your voiceover here</div>
                  <div className="text-xs text-slate-500 mt-1">MP3, WAV, M4A, AAC, FLAC, OGG or WebM</div>
                </>
              )}
              <button
                onClick={browse}
                className="mt-5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs transition-colors"
              >
                {selectedAudio ? 'Choose another file' : 'Browse files'}
              </button>
            </div>

            <div className="mt-5">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-400 mb-2">
                <KeyRound className="h-3.5 w-3.5" />
                Gemini API key
              </label>
              <input
                type="password"
                value={apiKeys.gemini}
                onChange={(event) => setApiKeys({ gemini: event.target.value })}
                placeholder="AQ.…"
                className="w-full rounded-xl border border-white/10 bg-[#0c0e13] px-4 py-3 text-sm outline-none focus:border-violet-500/60"
              />
              <p className="text-[11px] text-slate-600 mt-2">
                Stored by the desktop app and used only for Gemini transcription.
              </p>
            </div>

            <button
              onClick={createProject}
              disabled={!selectedAudio || !apiKeys.gemini.trim()}
              className="mt-6 w-full rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed py-3.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              Create and transcribe
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
