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

export interface VideoTrack {
  id: string
  name: string
  muted: boolean
  visible: boolean
}

export interface TrackSettings {
  muted: boolean
  visible: boolean
}

export interface SubtitleSettings {
  enabled: boolean
  fontSize: number
  fontFamily: string
  fontWeight: number
  textColor: string
  backgroundEnabled: boolean
  backgroundColor: string
  backgroundOpacity: number
  outlineEnabled: boolean
  outlineColor: string
  outlineWidth: number
  position: 'bottom' | 'center'
}

export interface SubtitleSegment {
  id: string
  startTimeSec: number
  endTimeSec: number
  text: string
}

export interface SceneSegment {
  id: string
  startTimeSec: number
  endTimeSec: number
  durationSec: number
  transcriptText: string
  keywords: string[]
  media: MediaAsset | null
  trackId: string
  volume: number
  scale: number
  opacity: number
}

export interface ProjectDocument {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  audioFile: { path: string; duration: number } | null
  scenes: SceneSegment[]
  videoTracks: VideoTrack[]
  voiceTrackSettings: TrackSettings
  audioTrackSettings: TrackSettings
  subtitles: SubtitleSegment[]
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

export interface ImageSearchResult {
  id: string
  sourceUrl: string
  thumbnailUrl: string
  title: string
  source: 'google' | 'pexels' | 'wikimedia'
}

export interface YouTubeSearchResult {
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  url: string
}

export type ExportEncoder = 'cpu' | 'nvenc'

export interface EncoderCapabilities {
  cpu: true
  nvenc: boolean
  amdGpuDetected: boolean
  gpuNames: string[]
}

export interface ExportVideoRequest {
  scenes: SceneSegment[]
  audioPath: string
  audioClips: TimelineAudioClip[]
  subtitleSettings: SubtitleSettings
  subtitles: SubtitleSegment[]
  videoTracks: VideoTrack[]
  voiceTrackSettings: TrackSettings
  audioTrackSettings: TrackSettings
  outputPath: string
  width: number
  height: number
  videoBitrate: string
  encoder: ExportEncoder
}

export interface ElectronAPI {
  openAudioFile: () => Promise<{ path: string; duration: number } | null>
  openMediaFiles: () => Promise<ImportedFile[]>
  transcribeAudio: (filePath: string, apiKey: string) => Promise<SceneSegment[]>
  listProjects: () => Promise<ProjectSummary[]>
  loadProject: (projectId: string) => Promise<ProjectDocument>
  saveProject: (project: ProjectDocument) => Promise<void>
  trimYouTube: (url: string, startTime: number, endTime: number) => Promise<string>
  searchImages: (query: string, pexelsKey?: string) => Promise<ImageSearchResult[]>
  searchGoogleImages: (
    query: string,
    apiKey: string,
    searchEngineId: string
  ) => Promise<ImageSearchResult[]>
  searchYouTube: (query: string, apiKey: string) => Promise<YouTubeSearchResult[]>
  chooseExportPath: (defaultName: string) => Promise<string | null>
  getEncoderCapabilities: () => Promise<EncoderCapabilities>
  exportVideo: (request: ExportVideoRequest) => Promise<string>
  cancelExport: () => Promise<boolean>
  onExportProgress: (callback: (progress: number) => void) => void
  getPexelsKey: () => Promise<string | null>
  setPexelsKey: (key: string) => Promise<void>
  getGeminiKey: () => Promise<string | null>
  setGeminiKey: (key: string) => Promise<void>
  getYouTubeKey: () => Promise<string | null>
  setYouTubeKey: (key: string) => Promise<void>
  getGoogleSearchKey: () => Promise<string | null>
  setGoogleSearchKey: (key: string) => Promise<void>
  getGoogleSearchCx: () => Promise<string | null>
  setGoogleSearchCx: (value: string) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
