export type AppScreen = 'projects' | 'new-project' | 'transcribing' | 'editor'

export type MediaKind = 'video' | 'image' | 'music' | 'sfx'

export interface MediaAsset {
  id: string
  type:
    | 'pexels_video'
    | 'youtube_clip'
    | 'google_image'
    | 'local_video'
    | 'local_image'
  kind?: MediaKind
  sourceUrl: string
  thumbnailUrl: string
  title: string
  durationSec?: number
  imageFit?: 'cover' | 'contain'
  enableKenBurnsEffect?: boolean
}

export interface LibraryAsset {
  id: string
  name: string
  path: string
  kind: MediaKind
  durationSec?: number
}

export interface TimelineAudioClip {
  id: string
  name: string
  path: string
  kind: 'music' | 'sfx'
  startTimeSec: number
  durationSec: number
  volume: number
}

export interface SubtitleSettings {
  enabled: boolean
  fontSize: number
  textColor: string
  backgroundColor: string
  position: 'bottom' | 'center'
}

export interface SceneSegment {
  id: string
  startTimeSec: number
  endTimeSec: number
  durationSec: number
  transcriptText: string
  keywords: string[]
  media: MediaAsset | null
}

export interface ProjectDocument {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  audioFile: { path: string; duration: number } | null
  scenes: SceneSegment[]
  mediaLibrary: LibraryAsset[]
  audioClips: TimelineAudioClip[]
  subtitleSettings: SubtitleSettings
}

export interface ProjectSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  duration: number
  sceneCount: number
}

export interface ImportedFile {
  path: string
  name: string
  kind: MediaKind
}

export interface ElectronAPI {
  openAudioFile: () => Promise<{ path: string; duration: number } | null>
  openMediaFiles: () => Promise<ImportedFile[]>
  transcribeAudio: (filePath: string, apiKey: string) => Promise<SceneSegment[]>
  listProjects: () => Promise<ProjectSummary[]>
  loadProject: (projectId: string) => Promise<ProjectDocument>
  saveProject: (project: ProjectDocument) => Promise<void>
  trimYouTube: (url: string, startTime: number, endTime: number) => Promise<string>
  searchImages: (query: string) => Promise<any[]>
  exportVideo: (
    scenes: SceneSegment[],
    audioPath: string,
    audioClips?: TimelineAudioClip[],
    subtitleSettings?: SubtitleSettings
  ) => Promise<void>
  onExportProgress: (callback: (progress: number) => void) => void
  getPexelsKey: () => Promise<string | null>
  setPexelsKey: (key: string) => Promise<void>
  getGeminiKey: () => Promise<string | null>
  setGeminiKey: (key: string) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
