import { create } from 'zustand'
import {
  AppScreen,
  LibraryAsset,
  MediaAsset,
  ProjectDocument,
  SceneSegment,
  SubtitleSettings,
  TimelineAudioClip,
} from '../types/editor'

const defaultSubtitleSettings: SubtitleSettings = {
  enabled: true,
  fontSize: 48,
  textColor: '#ffffff',
  backgroundColor: '#000000',
  position: 'bottom',
}

interface EditorStore {
  screen: AppScreen
  projectId: string | null
  projectName: string
  projectCreatedAt: string | null
  projectUpdatedAt: string | null
  audioFile: { path: string; duration: number } | null
  scenes: SceneSegment[]
  mediaLibrary: LibraryAsset[]
  audioClips: TimelineAudioClip[]
  subtitleSettings: SubtitleSettings
  activeSceneId: string | null
  currentTimeSec: number
  isPlaying: boolean
  apiKeys: {
    gemini: string
    pexels: string
  }
  isProcessingAudio: boolean
  processingError: string | null
  exportProgress: number | null
  seekTargetSec: number
  seekVersion: number

  setScreen: (screen: AppScreen) => void
  beginProject: (name: string, audioFile: { path: string; duration: number }) => void
  loadProject: (project: ProjectDocument) => void
  closeProject: () => void
  setProjectName: (name: string) => void
  setAudioFile: (file: { path: string; duration: number } | null) => void
  setScenes: (scenes: SceneSegment[]) => void
  updateScene: (id: string, updates: Partial<SceneSegment>) => void
  splitScene: (id: string, atTimeSec: number) => void
  trimScene: (id: string, startTimeSec: number, endTimeSec: number) => void
  deleteScene: (id: string) => void
  setActiveSceneId: (id: string | null) => void
  setCurrentTimeSec: (time: number) => void
  requestSeek: (time: number) => void
  setIsPlaying: (playing: boolean) => void
  setApiKeys: (keys: { gemini?: string; pexels?: string }) => void
  setIsProcessingAudio: (processing: boolean) => void
  setProcessingError: (error: string | null) => void
  setExportProgress: (progress: number | null) => void
  addMediaAssets: (assets: LibraryAsset[]) => void
  removeMediaAsset: (id: string) => void
  assignMediaToScene: (sceneId: string, media: MediaAsset) => void
  addAudioClip: (asset: LibraryAsset) => void
  removeAudioClip: (id: string) => void
  updateSubtitleSettings: (updates: Partial<SubtitleSettings>) => void
}

const markUpdated = () => new Date().toISOString()

export const useEditorStore = create<EditorStore>((set) => ({
  screen: 'projects',
  projectId: null,
  projectName: '',
  projectCreatedAt: null,
  projectUpdatedAt: null,
  audioFile: null,
  scenes: [],
  mediaLibrary: [],
  audioClips: [],
  subtitleSettings: defaultSubtitleSettings,
  activeSceneId: null,
  currentTimeSec: 0,
  isPlaying: false,
  apiKeys: { gemini: '', pexels: '' },
  isProcessingAudio: false,
  processingError: null,
  exportProgress: null,
  seekTargetSec: 0,
  seekVersion: 0,

  setScreen: (screen) => set({ screen }),
  beginProject: (name, audioFile) => {
    const now = markUpdated()
    set({
      screen: 'transcribing',
      projectId: crypto.randomUUID(),
      projectName: name.trim() || 'Untitled project',
      projectCreatedAt: now,
      projectUpdatedAt: now,
      audioFile,
      scenes: [],
      mediaLibrary: [],
      audioClips: [],
      subtitleSettings: defaultSubtitleSettings,
      activeSceneId: null,
      currentTimeSec: 0,
      isProcessingAudio: true,
      processingError: null,
    })
  },
  loadProject: (project) =>
    set({
      screen: 'editor',
      projectId: project.id,
      projectName: project.name,
      projectCreatedAt: project.createdAt,
      projectUpdatedAt: project.updatedAt,
      audioFile: project.audioFile,
      scenes: project.scenes,
      mediaLibrary: project.mediaLibrary || [],
      audioClips: project.audioClips || [],
      subtitleSettings: project.subtitleSettings || defaultSubtitleSettings,
      activeSceneId: project.scenes[0]?.id || null,
      currentTimeSec: 0,
      isPlaying: false,
      processingError: null,
    }),
  closeProject: () =>
    set({
      screen: 'projects',
      projectId: null,
      projectName: '',
      projectCreatedAt: null,
      projectUpdatedAt: null,
      audioFile: null,
      scenes: [],
      mediaLibrary: [],
      audioClips: [],
      activeSceneId: null,
      currentTimeSec: 0,
      isPlaying: false,
      processingError: null,
    }),
  setProjectName: (projectName) => set({ projectName, projectUpdatedAt: markUpdated() }),
  setAudioFile: (audioFile) => set({ audioFile, projectUpdatedAt: markUpdated() }),
  setScenes: (scenes) =>
    set((state) => {
      const duration = scenes.reduce((max, scene) => Math.max(max, scene.endTimeSec), 0)
      return {
        scenes,
        audioFile: state.audioFile
          ? { ...state.audioFile, duration: Math.max(duration, state.audioFile.duration || 0) }
          : null,
        activeSceneId: scenes[0]?.id || null,
        projectUpdatedAt: markUpdated(),
      }
    }),
  updateScene: (id, updates) =>
    set((state) => ({
      scenes: state.scenes.map((scene) => (scene.id === id ? { ...scene, ...updates } : scene)),
      projectUpdatedAt: markUpdated(),
    })),
  splitScene: (id, atTimeSec) =>
    set((state) => {
      const index = state.scenes.findIndex((scene) => scene.id === id)
      const scene = state.scenes[index]
      if (!scene || atTimeSec <= scene.startTimeSec + 0.2 || atTimeSec >= scene.endTimeSec - 0.2) {
        return state
      }

      const ratio = (atTimeSec - scene.startTimeSec) / scene.durationSec
      const words = scene.transcriptText.trim().split(/\s+/)
      const wordSplit = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)))
      const first: SceneSegment = {
        ...scene,
        id: `${scene.id}_a_${Date.now()}`,
        endTimeSec: atTimeSec,
        durationSec: atTimeSec - scene.startTimeSec,
        transcriptText: words.slice(0, wordSplit).join(' '),
      }
      const second: SceneSegment = {
        ...scene,
        id: `${scene.id}_b_${Date.now()}`,
        startTimeSec: atTimeSec,
        durationSec: scene.endTimeSec - atTimeSec,
        transcriptText: words.slice(wordSplit).join(' '),
      }
      const scenes = [...state.scenes]
      scenes.splice(index, 1, first, second)
      return {
        scenes,
        activeSceneId: second.id,
        projectUpdatedAt: markUpdated(),
      }
    }),
  trimScene: (id, startTimeSec, endTimeSec) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === id
          ? {
              ...scene,
              startTimeSec,
              endTimeSec,
              durationSec: Math.max(0.2, endTimeSec - startTimeSec),
            }
          : scene
      ),
      projectUpdatedAt: markUpdated(),
    })),
  deleteScene: (id) =>
    set((state) => ({
      scenes: state.scenes.filter((scene) => scene.id !== id),
      activeSceneId: state.activeSceneId === id ? null : state.activeSceneId,
      projectUpdatedAt: markUpdated(),
    })),
  setActiveSceneId: (activeSceneId) => set({ activeSceneId }),
  setCurrentTimeSec: (currentTimeSec) => set({ currentTimeSec }),
  requestSeek: (seekTargetSec) =>
    set((state) => ({
      seekTargetSec,
      seekVersion: state.seekVersion + 1,
      currentTimeSec: seekTargetSec,
    })),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setApiKeys: (keys) => set((state) => ({ apiKeys: { ...state.apiKeys, ...keys } })),
  setIsProcessingAudio: (isProcessingAudio) => set({ isProcessingAudio }),
  setProcessingError: (processingError) => set({ processingError }),
  setExportProgress: (exportProgress) => set({ exportProgress }),
  addMediaAssets: (assets) =>
    set((state) => {
      const existing = new Set(state.mediaLibrary.map((asset) => asset.path))
      return {
        mediaLibrary: [...state.mediaLibrary, ...assets.filter((asset) => !existing.has(asset.path))],
        projectUpdatedAt: markUpdated(),
      }
    }),
  removeMediaAsset: (id) =>
    set((state) => ({
      mediaLibrary: state.mediaLibrary.filter((asset) => asset.id !== id),
      projectUpdatedAt: markUpdated(),
    })),
  assignMediaToScene: (sceneId, media) =>
    set((state) => ({
      scenes: state.scenes.map((scene) => (scene.id === sceneId ? { ...scene, media } : scene)),
      projectUpdatedAt: markUpdated(),
    })),
  addAudioClip: (asset) =>
    set((state) => ({
      audioClips: [
        ...state.audioClips,
        {
          id: crypto.randomUUID(),
          name: asset.name,
          path: asset.path,
          kind: asset.kind === 'sfx' ? 'sfx' : 'music',
          startTimeSec: state.currentTimeSec,
          durationSec: asset.durationSec || 10,
          volume: asset.kind === 'sfx' ? 1 : 0.35,
        },
      ],
      projectUpdatedAt: markUpdated(),
    })),
  removeAudioClip: (id) =>
    set((state) => ({
      audioClips: state.audioClips.filter((clip) => clip.id !== id),
      projectUpdatedAt: markUpdated(),
    })),
  updateSubtitleSettings: (updates) =>
    set((state) => ({
      subtitleSettings: { ...state.subtitleSettings, ...updates },
      projectUpdatedAt: markUpdated(),
    })),
}))

export function getProjectDocument(): ProjectDocument | null {
  const state = useEditorStore.getState()
  if (!state.projectId || !state.projectCreatedAt) return null

  return {
    id: state.projectId,
    name: state.projectName,
    createdAt: state.projectCreatedAt,
    updatedAt: state.projectUpdatedAt || markUpdated(),
    audioFile: state.audioFile,
    scenes: state.scenes,
    mediaLibrary: state.mediaLibrary,
    audioClips: state.audioClips,
    subtitleSettings: state.subtitleSettings,
  }
}
