export type AppScreen =
  | 'projects'
  | 'new-project'
  | 'transcribing'
  | 'approval'
  | 'editor'

export type MediaKind = 'video' | 'image' | 'music' | 'sfx'

export type MediaProvider =
  | 'pexels'
  | 'pixabay'
  | 'archive_org'
  | 'nasa'
  | 'wikimedia'

export type MediaType =
  | 'local_image'
  | 'local_video'
  | 'remote_image'
  | 'remote_video'
  | 'motion_graphic'

export interface MediaLicense {
  name: string
  url?: string
  attributionRequired: boolean
  attributionText?: string
  shareAlike?: boolean
  warning?: string
}

export interface MediaProvenance {
  provider: MediaProvider | 'local' | 'youtube' | 'rhymx'
  sourceId: string
  landingPageUrl?: string
  creator?: string
  creatorUrl?: string
  license?: MediaLicense
  acquiredAt?: string
}

export interface MediaCandidate {
  id: string
  provider: MediaProvider
  kind: 'image' | 'video'
  title: string
  thumbnailUrl: string
  previewUrl: string
  downloadUrl?: string
  landingPageUrl: string
  width?: number
  height?: number
  durationSec?: number
  fileSizeBytes?: number
  creator?: string
  creatorUrl?: string
  license?: MediaLicense
  score?: number
  compatibility?: 'ready' | 'resolve' | 'unsupported'
}

export interface CaptionWord {
  id: string
  text: string
  startTimeSec: number
  endTimeSec: number
  confidence?: number
}

export type CaptionMode =
  | 'sentence'
  | 'active-word'
  | 'karaoke'
  | 'word'
  | 'phrase'
  | 'keywords'

export type MotionEngine = 'remotion' | 'hyperframes'

export interface MotionSceneConfig {
  templateId: string
  templateVersion: number
  engine: MotionEngine
  values: Record<string, string | number | boolean>
  accentColor?: string
  renderedAssetPath?: string
  renderCacheKey?: string
  renderedAt?: string
  renderedDurationSec?: number
  renderedWidth?: number
  renderedHeight?: number
  renderedFps?: number
}

export interface MotionTemplateField {
  id: string
  label: string
  type: 'text' | 'number' | 'color' | 'boolean'
  defaultValue: string | number | boolean
}

export interface MotionTemplateManifest {
  id: string
  version: number
  name: string
  category: string
  engine: MotionEngine
  defaultDurationSec: number
  supportsTransparency: boolean
  fields: MotionTemplateField[]
}

export interface MediaAsset {
  id: string
  type: MediaType
  kind?: MediaKind
  sourceUrl: string
  previewSourceUrl?: string
  thumbnailUrl: string
  title: string
  durationSec?: number
  sourceStartSec?: number
  sourceDurationSec?: number
  providerUrl?: string
  creatorName?: string
  creatorUrl?: string
  provenance?: MediaProvenance
  motion?: MotionSceneConfig
  providerStartSec?: number
  imageFit?: 'cover' | 'contain'
  enableKenBurnsEffect?: boolean
  missing?: boolean
  missingReason?: string
}

export interface LibraryAsset {
  id: string
  name: string
  path: string
  kind: MediaKind
  durationSec?: number
  origin?: 'imported' | 'youtube'
  thumbnailUrl?: string
  providerUrl?: string
  providerStartSec?: number
  missing?: boolean
  missingReason?: string
  provenance?: MediaProvenance
}

export interface TimelineAudioClip {
  id: string
  name: string
  path: string
  kind: 'music' | 'sfx'
  startTimeSec: number
  durationSec: number
  sourceStartSec?: number
  sourceDurationSec?: number
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
  mode: CaptionMode
  activeWordColor: string
  maximumCharactersPerLine: number
  minimumDisplayDurationSec: number
  maximumDisplayDurationSec: number
}

export interface SubtitleSegment {
  id: string
  startTimeSec: number
  endTimeSec: number
  text: string
  words?: CaptionWord[]
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
  words?: CaptionWord[]
  visualIntent?: string
  suggestedTreatment?: 'media' | 'motion'
}

export interface SceneMediaMatch {
  sceneId: string
  query: string
  queries?: string[]
  candidates: MediaCandidate[]
  confidence: 'strong' | 'review' | 'none'
  nextPage?: number
}

export interface ProjectDocument {
  schemaVersion: number
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
  visualGapsFilled?: boolean
  timingRepair?: {
    previousTimelineDuration: number
    actualAudioDuration: number
  }
  captionWords?: CaptionWord[]
}

export interface ProjectSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  duration: number
  sceneCount: number
}

export interface AppSettings {
  projectsDirectory: string
  defaultProjectsDirectory: string
  autoStockEnabled: boolean
  rememberApiKeys: boolean
  cacheSizeBytes: number
}

export type ApiKeyProvider = 'groq' | 'pexels' | 'pixabay' | 'youtube'

export interface ApiKeyTestResult {
  ok: boolean
  message: string
}

export interface MotionRendererHealth {
  available: boolean
  serviceVersion?: string
  hyperframesVersion?: string
  nodeVersion?: string
  ffmpegVersion?: string
  activeRenders?: number
  queuedRenders?: number
  message?: string
}

export interface MotionRenderRequest {
  templateId: string
  templateVersion: number
  values: Record<string, string | number | boolean>
  accentColor?: string
  durationSec: number
  width: number
  height: number
  fps: number
}

export interface MotionRenderProgress {
  jobId: string
  status: 'queued' | 'rendering' | 'complete' | 'failed' | 'cancelled'
  progress: number
  message?: string
}

export interface MotionRenderAsset extends ImportedFile {
  cacheKey: string
  cached: boolean
  renderedAt: string
  durationSec: number
  width: number
  height: number
  fps: number
}

export interface PexelsAutoMatchProgress {
  completed: number
  total: number
  matched: number
  sceneId?: string
  query?: string
}

export interface TranscriptionProgress {
  stage: 'preparing' | 'transcribing' | 'keywords'
  completed: number
  total: number
  message: string
}

export interface PexelsAutoMatchResult {
  scenes: SceneSegment[]
  matchedCount: number
  unmatchedCount: number
  warnings: string[]
}

export interface MediaSearchRequest {
  query: string
  providers?: MediaProvider[]
  kind?: 'all' | 'image' | 'video'
  orientation?: 'any' | 'landscape' | 'portrait' | 'square'
  page?: number
}

export interface MediaSearchResponse {
  candidates: MediaCandidate[]
  errors: Array<{ provider: MediaProvider; message: string }>
  nextPage?: number
}

export interface ImportedFile {
  path: string
  name: string
  kind: MediaKind
  durationSec?: number
}

export interface ImageSearchResult {
  id: string
  sourceUrl: string
  thumbnailUrl: string
  title: string
  source: 'duckduckgo' | 'pexels' | 'wikimedia'
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
  nvencReason?: string
  nvencEncoder?: 'h264_nvenc'
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
  motionMode?: 'local' | 'fallback'
}

export interface BatchExportRequest {
  projectIds: string[]
  outputDirectory: string
  width: number
  height: number
  videoBitrate: string
  encoder: ExportEncoder
}

export interface BatchExportProgress {
  projectId: string
  projectName: string
  projectIndex: number
  totalProjects: number
  projectProgress: number
  status: 'preparing' | 'rendering' | 'completed' | 'failed' | 'cancelled'
  message?: string
}

export interface BatchExportResult {
  completed: Array<{ projectId: string; outputPath: string }>
  failed: Array<{ projectId: string; error: string }>
  cancelled: boolean
}

export interface RhymxPlatformAPI {
  openAudioFile: () => Promise<{ path: string; duration: number } | null>
  openMediaFiles: () => Promise<ImportedFile[]>
  getMediaDuration: (filePath: string) => Promise<number | null>
  transcribeAudio: (filePath: string, apiKey?: string) => Promise<SceneSegment[]>
  onTranscriptionProgress: (
    callback: (progress: TranscriptionProgress) => void
  ) => void
  autoMatchPexelsVideos: (
    scenes: SceneSegment[],
    apiKey: string
  ) => Promise<PexelsAutoMatchResult>
  autoMatchScenes: (
    scenes: SceneSegment[],
    providers?: MediaProvider[]
  ) => Promise<SceneMediaMatch[]>
  searchMedia: (request: MediaSearchRequest) => Promise<MediaSearchResponse>
  resolveMedia: (candidate: MediaCandidate) => Promise<MediaCandidate>
  acquireMedia: (candidate: MediaCandidate) => Promise<LibraryAsset>
  onAssetAcquisitionProgress: (
    callback: (progress: { candidateId: string; percent: number }) => void
  ) => void
  onPexelsAutoMatchProgress: (
    callback: (progress: PexelsAutoMatchProgress) => void
  ) => void
  listProjects: () => Promise<ProjectSummary[]>
  loadProject: (projectId: string) => Promise<ProjectDocument>
  saveProject: (project: ProjectDocument) => Promise<void>
  renameProject: (projectId: string, name: string) => Promise<void>
  duplicateProject: (projectId: string) => Promise<string>
  deleteProject: (projectId: string) => Promise<void>
  getAppSettings: () => Promise<AppSettings>
  chooseProjectsDirectory: () => Promise<AppSettings | null>
  resetProjectsDirectory: () => Promise<AppSettings>
  setAutoStockEnabled: (enabled: boolean) => Promise<AppSettings>
  clearCache: () => Promise<AppSettings>
  trimYouTube: (
    url: string,
    startTime: number,
    endTime: number,
    projectId: string
  ) => Promise<string>
  onYouTubeTrimProgress: (callback: (progress: number) => void) => void
  searchImages: (query: string, pexelsKey?: string) => Promise<ImageSearchResult[]>
  searchDuckDuckGoImages: (query: string) => Promise<ImageSearchResult[]>
  searchYouTube: (query: string, apiKey: string) => Promise<YouTubeSearchResult[]>
  chooseExportPath: (defaultName: string) => Promise<string | null>
  getEncoderCapabilities: () => Promise<EncoderCapabilities>
  exportVideo: (request: ExportVideoRequest) => Promise<string>
  cancelExport: () => Promise<boolean>
  onExportProgress: (callback: (progress: number) => void) => void
  chooseBatchExportDirectory: () => Promise<string | null>
  batchExportProjects: (request: BatchExportRequest) => Promise<BatchExportResult>
  cancelBatchExport: () => Promise<boolean>
  onBatchExportProgress: (
    callback: (progress: BatchExportProgress) => void
  ) => void
  getPexelsKey: () => Promise<string | null>
  setPexelsKey: (key: string) => Promise<void>
  getPixabayKey: () => Promise<string | null>
  setPixabayKey: (key: string) => Promise<void>
  getGroqKey: () => Promise<string | null>
  setGroqKey: (key: string) => Promise<void>
  getYouTubeKey: () => Promise<string | null>
  setYouTubeKey: (key: string) => Promise<void>
  setRememberApiKeys: (remember: boolean) => Promise<AppSettings>
  testApiKey: (provider: ApiKeyProvider, key: string) => Promise<ApiKeyTestResult>
  getMotionRendererHealth: () => Promise<MotionRendererHealth>
  renderMotionGraphic: (request: MotionRenderRequest) => Promise<MotionRenderAsset>
  cancelMotionRender: () => Promise<boolean>
  onMotionRenderProgress: (
    callback: (progress: MotionRenderProgress) => void
  ) => void
}

declare global {
  interface Window {
    rhymx: RhymxPlatformAPI
    showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>
  }
}
