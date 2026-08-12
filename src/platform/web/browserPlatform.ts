import {
  AppSettings,
  BatchExportProgress,
  BatchExportRequest,
  BatchExportResult,
  EncoderCapabilities,
  ExportVideoRequest,
  ImageSearchResult,
  ImportedFile,
  MediaKind,
  PexelsAutoMatchProgress,
  PexelsAutoMatchResult,
  ProjectDocument,
  ProjectSummary,
  RhymxPlatformAPI,
  SceneSegment,
  TranscriptionProgress,
  YouTubeSearchResult,
} from '../../types/editor'
import { MainComposition } from '../../remotion/Composition'
import {
  fileForSource,
  hydrateMediaSources,
  openRhymxDatabase,
  storeAsset,
  storedAssetBytes,
} from './browserAssets'
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  migrateProject,
} from '../../core/project/migrations'

const GROQ_ROOT = 'https://api.groq.com/openai/v1'
const SETTINGS_KEY = 'rhymx.web.settings'
const SECRET_PREFIX = 'rhymx.web.key.'
const exportTargets = new Map<string, FileSystemFileHandle>()
const batchTargets = new Map<string, FileSystemDirectoryHandle>()
let exportController: AbortController | null = null
let batchCancelled = false
let transcriptionListener: (progress: TranscriptionProgress) => void = () => undefined
let pexelsListener: (progress: PexelsAutoMatchProgress) => void = () => undefined
let exportListener: (progress: number) => void = () => undefined
let batchListener: (progress: BatchExportProgress) => void = () => undefined

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function projectStore(mode: IDBTransactionMode = 'readonly') {
  const database = await openRhymxDatabase()
  return database.transaction('projects', mode).objectStore('projects')
}

function projectSources(project: ProjectDocument) {
  return [
    project.audioFile?.path,
    ...project.mediaLibrary.map((asset) => asset.path),
    ...project.audioClips.map((clip) => clip.path),
    ...project.scenes.map((scene) => scene.media?.sourceUrl),
  ].filter((source): source is string => Boolean(source))
}

async function listProjects(): Promise<ProjectSummary[]> {
  const store = await projectStore()
  const projects = (await requestResult(store.getAll())) as ProjectDocument[]
  return projects
    .map(migrateProject)
    .map((project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      duration: Math.max(
        project.audioFile?.duration || 0,
        ...project.scenes.map((scene) => scene.endTimeSec),
        0
      ),
      sceneCount: project.scenes.length,
    }))
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
}

async function loadProject(projectId: string) {
  const store = await projectStore()
  const stored = (await requestResult(store.get(projectId))) as ProjectDocument
  if (!stored) throw new Error('Project not found.')
  const project = migrateProject(stored)
  await hydrateMediaSources(projectSources(project))
  return project
}

async function saveProject(project: ProjectDocument) {
  const store = await projectStore('readwrite')
  await requestResult(
    store.put({ ...project, schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION })
  )
}

async function mediaDuration(source: string) {
  const file = await fileForSource(source)
  const url = file ? URL.createObjectURL(file) : source
  try {
    return await new Promise<number | null>((resolve) => {
      const media = document.createElement('video')
      const finish = (value: number | null) => {
        media.removeAttribute('src')
        media.load()
        resolve(value)
      }
      media.preload = 'metadata'
      media.onloadedmetadata = () =>
        finish(Number.isFinite(media.duration) ? media.duration : null)
      media.onerror = () => finish(null)
      media.src = url
    })
  } finally {
    if (file) URL.revokeObjectURL(url)
  }
}

const kindForFile = (file: File): MediaKind => {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'music'
}

async function chooseFiles(accept: string[], multiple: boolean) {
  const picker = (window as Window & {
    showOpenFilePicker?: (options: unknown) => Promise<FileSystemFileHandle[]>
  }).showOpenFilePicker
  if (picker) {
    try {
      const handles = await picker({
        multiple,
      })
      return await Promise.all(
        handles.map(async (handle) => ({ file: await handle.getFile(), handle }))
      )
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return []
      throw error
    }
  }
  return await new Promise<Array<{ file: File; handle?: FileSystemFileHandle }>>(
    (resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = multiple
      input.accept = accept.join(',')
      input.onchange = () =>
        resolve(Array.from(input.files || []).map((file) => ({ file })))
      input.click()
    }
  )
}

async function openAudioFile() {
  const chosen = await chooseFiles(
    ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.webm'],
    false
  )
  const item = chosen[0]
  if (!item) return null
  const imported = await storeAsset(item.file, 'music', item.handle)
  return { path: imported.path, duration: (await mediaDuration(imported.path)) || 0 }
}

async function openMediaFiles(): Promise<ImportedFile[]> {
  const chosen = await chooseFiles(
    ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp3', '.wav', '.m4a', '.aac', '.ogg'],
    true
  )
  return await Promise.all(
    chosen.map(({ file, handle }) => storeAsset(file, kindForFile(file), handle))
  )
}

type GroqWord = { word?: string; start?: number; end?: number }
type GroqSegment = { text?: string; start?: number; end?: number }

async function groqRequest<T>(path: string, apiKey: string, init: RequestInit) {
  const response = await fetch(`${GROQ_ROOT}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...init.headers },
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Groq request failed (${response.status}): ${body.slice(0, 300)}`)
  }
  return (await response.json()) as T
}

function scenesFromTranscript(words: GroqWord[], segments: GroqSegment[], duration: number): SceneSegment[] {
  const timedWords = words
    .map((word) => ({
      text: String(word.word || '').trim(),
      start: Number(word.start),
      end: Number(word.end),
    }))
    .filter((word) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end))
  if (!timedWords.length) {
    return segments.map((segment, index) => ({
      id: `scene_${index + 1}`,
      startTimeSec: Number(segment.start || 0),
      endTimeSec: Number(segment.end || duration),
      durationSec: Math.max(1 / 30, Number(segment.end || duration) - Number(segment.start || 0)),
      transcriptText: String(segment.text || '').trim(),
      keywords: [],
      media: null,
      trackId: 'track_main',
      volume: 1,
      scale: 1,
      opacity: 1,
    }))
  }
  const groups: typeof timedWords[] = []
  let group: typeof timedWords = []
  for (const word of timedWords) {
    group.push(word)
    const span = word.end - group[0].start
    if (span >= 5 || (span >= 2.5 && /[.!?]$/.test(word.text))) {
      groups.push(group)
      group = []
    }
  }
  if (group.length) groups.push(group)
  return groups.map((items, index) => ({
    id: `scene_${index + 1}`,
    startTimeSec: items[0].start,
    endTimeSec: items[items.length - 1].end,
    durationSec: items[items.length - 1].end - items[0].start,
    transcriptText: items.map((item) => item.text).join(' ').replace(/\s+([,.;:!?])/g, '$1'),
    keywords: [],
    media: null,
    trackId: 'track_main',
    volume: 1,
    scale: 1,
    opacity: 1,
  }))
}

async function transcribeAudio(source: string, apiKey: string) {
  const file = await fileForSource(source)
  if (!file) throw new Error('The selected voiceover is no longer available. Re-select it and try again.')
  transcriptionListener({ stage: 'preparing', completed: 0, total: 1, message: 'Preparing voiceover in your browser' })
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('model', 'whisper-large-v3-turbo')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  form.append('timestamp_granularities[]', 'segment')
  transcriptionListener({ stage: 'transcribing', completed: 0, total: 1, message: 'Transcribing with Groq Whisper' })
  const result = await groqRequest<{
    duration?: number
    words?: GroqWord[]
    segments?: GroqSegment[]
  }>('/audio/transcriptions', apiKey.trim(), { method: 'POST', body: form })
  let scenes = scenesFromTranscript(result.words || [], result.segments || [], result.duration || (await mediaDuration(source)) || 0)
  if (!scenes.length) throw new Error('Groq Whisper returned an empty transcript.')
  transcriptionListener({ stage: 'keywords', completed: 0, total: 1, message: 'Generating visual search phrases' })
  try {
    const keywordResult = await groqRequest<{ choices?: Array<{ message?: { content?: string } }> }>(
      '/chat/completions', apiKey.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [{
            role: 'user',
            content: `Return JSON {"keywords":[["phrase"]]} with 1-3 concrete stock-footage search phrases for each narration scene, in order: ${JSON.stringify(scenes.map((scene) => scene.transcriptText))}`,
          }],
        }),
      }
    )
    const parsed = JSON.parse(keywordResult.choices?.[0]?.message?.content || '{}') as { keywords?: string[][] }
    scenes = scenes.map((scene, index) => ({ ...scene, keywords: parsed.keywords?.[index]?.slice(0, 3) || [] }))
  } catch (error) {
    console.warn('Keyword generation failed; transcription remains usable.', error)
  }
  transcriptionListener({ stage: 'keywords', completed: 1, total: 1, message: 'Voiceover analysis complete' })
  return scenes
}

async function pexelsVideos(query: string, apiKey: string) {
  const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=12&orientation=landscape`, {
    headers: { Authorization: apiKey },
  })
  if (!response.ok) throw new Error(`Pexels request failed (${response.status}).`)
  return (await response.json()) as {
    videos?: Array<{
      id: number
      duration: number
      url: string
      user?: { name?: string; url?: string }
      image?: string
      video_files?: Array<{ link: string; width?: number; height?: number; file_type?: string }>
    }>
  }
}

async function autoMatchPexelsVideos(scenes: SceneSegment[], apiKey: string): Promise<PexelsAutoMatchResult> {
  let matched = 0
  const warnings: string[] = []
  const output: SceneSegment[] = []
  for (const [index, scene] of scenes.entries()) {
    const query = scene.keywords[0] || scene.transcriptText.split(/\s+/).slice(0, 7).join(' ')
    try {
      const result = await pexelsVideos(query, apiKey)
      const video = result.videos?.[0]
      const file = video?.video_files
        ?.filter((item) => item.file_type === 'video/mp4')
        .sort((a, b) => Math.abs((a.width || 1280) - 1280) - Math.abs((b.width || 1280) - 1280))[0]
      if (video && file) {
        matched += 1
        output.push({
          ...scene,
          media: {
            id: `pexels_${video.id}`,
            type: 'pexels_video',
            sourceUrl: file.link,
            thumbnailUrl: video.image || '',
            title: query,
            durationSec: video.duration,
            sourceStartSec: 0,
            sourceDurationSec: video.duration,
            providerUrl: video.url,
            creatorName: video.user?.name,
            creatorUrl: video.user?.url,
          },
        })
      } else output.push(scene)
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error))
      output.push(scene)
    }
    pexelsListener({ completed: index + 1, total: scenes.length, matched, sceneId: scene.id, query })
  }
  return { scenes: output, matchedCount: matched, unmatchedCount: scenes.length - matched, warnings }
}

async function searchImages(query: string, apiKey = ''): Promise<ImageSearchResult[]> {
  if (!apiKey.trim()) return searchWikimedia(query)
  const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=24&orientation=landscape`, { headers: { Authorization: apiKey } })
  if (!response.ok) throw new Error(`Pexels request failed (${response.status}).`)
  const result = (await response.json()) as { photos?: Array<{ id: number; alt?: string; url?: string; src?: { large?: string; medium?: string } }> }
  return (result.photos || []).map((photo) => ({
    id: `pexels_image_${photo.id}`,
    sourceUrl: photo.src?.large || '',
    thumbnailUrl: photo.src?.medium || photo.src?.large || '',
    title: photo.alt || query,
    source: 'pexels',
  }))
}

async function searchWikimedia(query: string): Promise<ImageSearchResult[]> {
  const endpoint = new URL('https://commons.wikimedia.org/w/api.php')
  endpoint.search = new URLSearchParams({
    action: 'query', generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '24',
    prop: 'imageinfo', iiprop: 'url', iiurlwidth: '640', format: 'json', origin: '*',
  }).toString()
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error(`Wikimedia request failed (${response.status}).`)
  const body = (await response.json()) as { query?: { pages?: Record<string, { pageid: number; title: string; imageinfo?: Array<{ url?: string; thumburl?: string }> }> } }
  return Object.values(body.query?.pages || {}).map((page) => ({
    id: `wikimedia_${page.pageid}`,
    sourceUrl: page.imageinfo?.[0]?.url || '',
    thumbnailUrl: page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url || '',
    title: page.title.replace(/^File:/, ''),
    source: 'wikimedia',
  }))
}

async function searchYouTube(query: string, apiKey: string): Promise<YouTubeSearchResult[]> {
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=20&q=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`)
  if (!response.ok) throw new Error(`YouTube search failed (${response.status}).`)
  const body = (await response.json()) as { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string } } } }> }
  return (body.items || []).flatMap((item) => item.id?.videoId ? [{
    id: item.id.videoId,
    title: item.snippet?.title || 'YouTube video',
    channelTitle: item.snippet?.channelTitle || '',
    thumbnailUrl: item.snippet?.thumbnails?.medium?.url || '',
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
  }] : [])
}

function settings(): AppSettings {
  const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<AppSettings>
  return {
    projectsDirectory: 'Browser storage',
    defaultProjectsDirectory: 'Browser storage',
    autoStockEnabled: stored.autoStockEnabled ?? true,
    cacheSizeBytes: 0,
  }
}

async function encoderCapabilities(): Promise<EncoderCapabilities> {
  const webCodecs = 'VideoEncoder' in window
  return {
    cpu: true,
    nvenc: false,
    nvencReason: webCodecs ? 'The browser chooses available hardware acceleration automatically.' : 'WebCodecs is unavailable in this browser.',
    amdGpuDetected: false,
    gpuNames: [webCodecs ? 'Browser WebCodecs' : 'Software compatibility mode'],
  }
}

async function chooseExportPath(defaultName: string) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultName,
        types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
      })
      const id = `browser-file:${crypto.randomUUID()}`
      exportTargets.set(id, handle)
      return id
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return null
      throw error
    }
  }
  return defaultName
}

async function exportVideo(request: ExportVideoRequest) {
  const { renderMediaOnWeb } = await import('@remotion/web-renderer')
  exportController = new AbortController()
  const duration = Math.max(
    ...request.scenes.map((scene) => scene.endTimeSec),
    ...request.subtitles.map((subtitle) => subtitle.endTimeSec),
    ...request.audioClips.map((clip) => clip.startTimeSec + clip.durationSec),
    1
  )
  const outputHandle = exportTargets.get(request.outputPath)
  const outputWritable = outputHandle ? await outputHandle.createWritable() : undefined
  const result = await renderMediaOnWeb({
    composition: {
      id: 'rhymx-export',
      component: MainComposition,
      durationInFrames: Math.ceil(duration * 30),
      fps: 30,
      width: request.width,
      height: request.height,
      defaultProps: {
        scenes: request.scenes,
        subtitles: request.subtitles,
        audioPath: request.audioPath,
        audioClips: request.audioClips,
        subtitleSettings: request.subtitleSettings,
        videoTracks: request.videoTracks,
        voiceTrackSettings: request.voiceTrackSettings,
        audioTrackSettings: request.audioTrackSettings,
        renderScale: request.width / 1920,
      },
    },
    inputProps: {
      scenes: request.scenes,
      subtitles: request.subtitles,
      audioPath: request.audioPath,
      audioClips: request.audioClips,
      subtitleSettings: request.subtitleSettings,
      videoTracks: request.videoTracks,
      voiceTrackSettings: request.voiceTrackSettings,
      audioTrackSettings: request.audioTrackSettings,
      renderScale: request.width / 1920,
    },
    videoBitrate: Number.parseInt(request.videoBitrate) * 1_000_000,
    hardwareAcceleration: 'no-preference',
    pageResponsiveness: 'medium',
    outputWritable,
    signal: exportController.signal,
    onProgress: ({ progress }) => exportListener(progress * 100),
  })
  if (!outputWritable) {
    const blob = await result.getBlob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = request.outputPath.replace(/^.*[\\/]/, '') || 'Rhymx video.mp4'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
  exportController = null
  exportListener(100)
  return outputHandle?.name || request.outputPath
}

async function batchExportProjects(request: BatchExportRequest): Promise<BatchExportResult> {
  const directory = batchTargets.get(request.outputDirectory)
  if (!directory) throw new Error('Choose a browser-accessible output folder first.')
  batchCancelled = false
  const completed: BatchExportResult['completed'] = []
  const failed: BatchExportResult['failed'] = []
  for (const [index, projectId] of request.projectIds.entries()) {
    if (batchCancelled) break
    const project = await loadProject(projectId)
    try {
      const handle = await directory.getFileHandle(`${project.name.replace(/[<>:"/\\|?*]/g, '_')}.mp4`, { create: true })
      const target = `browser-file:${crypto.randomUUID()}`
      exportTargets.set(target, handle)
      exportListener = (progress) => batchListener({
        projectId, projectName: project.name, projectIndex: index,
        totalProjects: request.projectIds.length, projectProgress: progress,
        status: progress >= 100 ? 'completed' : 'rendering',
      })
      await exportVideo({
        scenes: project.scenes,
        audioPath: project.audioFile?.path || '',
        audioClips: project.audioClips,
        subtitleSettings: project.subtitleSettings,
        subtitles: project.subtitles,
        videoTracks: project.videoTracks,
        voiceTrackSettings: project.voiceTrackSettings,
        audioTrackSettings: project.audioTrackSettings,
        outputPath: target,
        width: request.width,
        height: request.height,
        videoBitrate: request.videoBitrate,
        encoder: 'cpu',
      })
      completed.push({ projectId, outputPath: handle.name })
    } catch (error) {
      failed.push({ projectId, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { completed, failed, cancelled: batchCancelled }
}

const api: RhymxPlatformAPI = {
  openAudioFile,
  openMediaFiles,
  getMediaDuration: mediaDuration,
  transcribeAudio,
  onTranscriptionProgress: (callback) => { transcriptionListener = callback },
  autoMatchPexelsVideos,
  onPexelsAutoMatchProgress: (callback) => { pexelsListener = callback },
  listProjects,
  loadProject,
  saveProject,
  renameProject: async (id, name) => saveProject({ ...(await loadProject(id)), name, updatedAt: new Date().toISOString() }),
  duplicateProject: async (id) => {
    const source = await loadProject(id)
    const nextId = crypto.randomUUID()
    const now = new Date().toISOString()
    await saveProject({ ...source, id: nextId, name: `${source.name} copy`, createdAt: now, updatedAt: now })
    return nextId
  },
  deleteProject: async (id) => requestResult((await projectStore('readwrite')).delete(id)),
  getAppSettings: async () => ({ ...settings(), cacheSizeBytes: await storedAssetBytes() }),
  chooseProjectsDirectory: async () => null,
  resetProjectsDirectory: async () => settings(),
  setAutoStockEnabled: async (enabled) => {
    const next = { ...settings(), autoStockEnabled: enabled }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
    return next
  },
  clearCache: async () => ({ ...settings(), cacheSizeBytes: await storedAssetBytes() }),
  trimYouTube: async () => { throw new Error('YouTube downloading is unavailable in a browser. Use the preview, then import media you have permission to use.') },
  onYouTubeTrimProgress: () => undefined,
  searchImages,
  searchDuckDuckGoImages: searchWikimedia,
  searchYouTube,
  chooseExportPath,
  getEncoderCapabilities: encoderCapabilities,
  exportVideo,
  cancelExport: async () => { exportController?.abort(); return Boolean(exportController) },
  onExportProgress: (callback) => { exportListener = callback },
  chooseBatchExportDirectory: async () => {
    const picker = (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker
    if (!picker) return null
    try {
      const handle = await picker()
      const id = `browser-directory:${crypto.randomUUID()}`
      batchTargets.set(id, handle)
      return id
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return null
      throw error
    }
  },
  batchExportProjects,
  cancelBatchExport: async () => { batchCancelled = true; exportController?.abort(); return true },
  onBatchExportProgress: (callback) => { batchListener = callback },
  getPexelsKey: async () => localStorage.getItem(`${SECRET_PREFIX}pexels`),
  setPexelsKey: async (key) => localStorage.setItem(`${SECRET_PREFIX}pexels`, key),
  getGroqKey: async () => localStorage.getItem(`${SECRET_PREFIX}groq`),
  setGroqKey: async (key) => localStorage.setItem(`${SECRET_PREFIX}groq`, key),
  getYouTubeKey: async () => localStorage.getItem(`${SECRET_PREFIX}youtube`),
  setYouTubeKey: async (key) => localStorage.setItem(`${SECRET_PREFIX}youtube`, key),
}

export function installBrowserPlatform() {
  window.rhymx = api
  void navigator.storage?.persist?.()
}
