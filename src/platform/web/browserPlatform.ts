import {
  ApiKeyProvider,
  ApiKeyTestResult,
  AppSettings,
  BatchExportProgress,
  BatchExportRequest,
  BatchExportResult,
  EncoderCapabilities,
  ExportVideoRequest,
  ImageSearchResult,
  ImportedFile,
  MediaKind,
  MediaCandidate,
  MediaProvider,
  MediaSearchRequest,
  MediaSearchResponse,
  MotionRenderAsset,
  MotionRendererHealth,
  MotionRenderProgress,
  MotionRenderRequest,
  PexelsAutoMatchProgress,
  PexelsAutoMatchResult,
  ProjectDocument,
  ProjectSummary,
  RhymxPlatformAPI,
  SceneSegment,
  SceneMediaMatch,
  TranscriptionProgress,
  YouTubeSearchResult,
} from '../../types/editor'
import { MainComposition } from '../../remotion/Composition'
import { selectPexelsVideoSources } from '../../core/media/pexelsVideoFiles'
import { recommendedSearchKeywords } from '../../core/scenes/searchKeywords'
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
const REMEMBERED_KEYS_KEY = 'rhymx.web.apiKeys.remembered'
const SESSION_KEYS_KEY = 'rhymx.web.apiKeys.session'
const MOTION_RENDERER_ORIGIN = 'http://127.0.0.1:43127'
const API_KEY_PROVIDERS: ApiKeyProvider[] = ['groq', 'pexels', 'pixabay', 'youtube']
const exportTargets = new Map<string, FileSystemFileHandle>()
const batchTargets = new Map<string, FileSystemDirectoryHandle>()
let exportController: AbortController | null = null
let batchCancelled = false
let motionSessionToken = ''
let activeMotionJobId: string | null = null
let motionAbortController: AbortController | null = null
let transcriptionListener: (progress: TranscriptionProgress) => void = () => undefined
let pexelsListener: (progress: PexelsAutoMatchProgress) => void = () => undefined
let exportListener: (progress: number) => void = () => undefined
let batchListener: (progress: BatchExportProgress) => void = () => undefined
let acquisitionListener: (progress: { candidateId: string; percent: number }) => void = () => undefined
let motionListener: (progress: MotionRenderProgress) => void = () => undefined

type StoredApiKeys = Partial<Record<ApiKeyProvider, string>>

function parsedStorage(storage: Storage, key: string): StoredApiKeys {
  try {
    const value = JSON.parse(storage.getItem(key) || '{}') as StoredApiKeys
    return Object.fromEntries(
      API_KEY_PROVIDERS.flatMap((provider) =>
        typeof value[provider] === 'string' ? [[provider, value[provider]]] : []
      )
    ) as StoredApiKeys
  } catch {
    return {}
  }
}

function rememberApiKeys() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<AppSettings>
    return stored.rememberApiKeys ?? true
  } catch {
    return true
  }
}

function storedApiKeys() {
  return rememberApiKeys()
    ? parsedStorage(localStorage, REMEMBERED_KEYS_KEY)
    : parsedStorage(sessionStorage, SESSION_KEYS_KEY)
}

function apiKeyFor(provider: ApiKeyProvider) {
  return storedApiKeys()[provider]?.trim() || ''
}

function setStoredApiKey(provider: ApiKeyProvider, value: string) {
  const storage = rememberApiKeys() ? localStorage : sessionStorage
  const key = rememberApiKeys() ? REMEMBERED_KEYS_KEY : SESSION_KEYS_KEY
  const next = { ...parsedStorage(storage, key), [provider]: value }
  if (value) storage.setItem(key, JSON.stringify(next))
  else {
    delete next[provider]
    if (Object.keys(next).length) storage.setItem(key, JSON.stringify(next))
    else storage.removeItem(key)
  }
}

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
    ...project.scenes.map((scene) => scene.media?.previewSourceUrl),
    ...project.scenes.map((scene) => scene.media?.motion?.renderedAssetPath),
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
    .map((word, index) => ({
      id: `word_${index + 1}`,
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
      keywords: recommendedSearchKeywords(String(segment.text || '')),
      media: null,
      trackId: 'track_main',
      volume: 1,
      scale: 1,
      opacity: 1,
      words: [],
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
    keywords: recommendedSearchKeywords(items.map((item) => item.text).join(' ')),
    media: null,
    trackId: 'track_main',
    volume: 1,
    scale: 1,
    opacity: 1,
    words: items.map((item) => ({
      id: item.id,
      text: item.text,
      startTimeSec: item.start,
      endTimeSec: item.end,
    })),
  }))
}

function providerWorkerOrigin() {
  const configured = String(
    (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
      ?.VITE_RHYMX_PROVIDER_WORKER_URL || ''
  ).trim()
  if (configured) return configured.replace(/\/$/, '')
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? ''
    : window.location.origin
}

async function backendRequest<T>(path: string, init?: RequestInit) {
  const origin = providerWorkerOrigin()
  if (!origin) throw new Error('The hosted provider service is not configured for local development.')
  const response = await fetch(`${origin}${path}`, init)
  if (!response.ok) {
    const body = await response.text()
    let message = body
    try {
      message = (JSON.parse(body) as { error?: string }).error || body
    } catch {
      // Keep the response body as the actionable message.
    }
    throw new Error(message || `Rhymx service request failed (${response.status}).`)
  }
  return (await response.json()) as T
}

async function transcribeAudio(source: string, suppliedApiKey = '') {
  const file = await fileForSource(source)
  if (!file) throw new Error('The selected voiceover is no longer available. Re-select it and try again.')
  const apiKey = suppliedApiKey.trim() || apiKeyFor('groq')
  if (!apiKey) throw new Error('Add a Groq API key in Settings before transcribing.')
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
  }>('/audio/transcriptions', apiKey, { method: 'POST', body: form })
  let scenes = scenesFromTranscript(result.words || [], result.segments || [], result.duration || (await mediaDuration(source)) || 0)
  if (!scenes.length) throw new Error('Groq Whisper returned an empty transcript.')
  transcriptionListener({ stage: 'keywords', completed: 0, total: 1, message: 'Generating visual search phrases' })
  try {
    const prompt = `Return JSON with two arrays: {"keywords":[["two or three concrete visual search phrases"]],"treatments":["media" or "motion"]}. Keep exactly one entry per scene. Prefer motion only for statistics, quotations, abstract transitions, titles, or calls to action. Scenes: ${JSON.stringify(scenes.map((scene) => scene.transcriptText))}`
    const response = await groqRequest<{
      choices?: Array<{ message?: { content?: string } }>
    }>('/chat/completions', apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
      })
    const keywordResult = JSON.parse(response.choices?.[0]?.message?.content || '{}') as {
      keywords?: string[][]
      treatments?: Array<'media' | 'motion'>
    }
    scenes = scenes.map((scene, index) => ({
      ...scene,
      keywords: recommendedSearchKeywords(
        scene.transcriptText,
        keywordResult.keywords?.[index] || []
      ),
      suggestedTreatment: keywordResult.treatments?.[index] || 'media',
    }))
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
      const sources = selectPexelsVideoSources(video?.video_files)
      if (video && sources.sourceUrl) {
        matched += 1
        output.push({
          ...scene,
          media: {
            id: `pexels_${video.id}`,
            type: 'remote_video',
            sourceUrl: sources.sourceUrl,
            previewSourceUrl: sources.previewSourceUrl,
            thumbnailUrl: video.image || '',
            title: query,
            durationSec: video.duration,
            sourceStartSec: 0,
            sourceDurationSec: video.duration,
            providerUrl: video.url,
            creatorName: video.user?.name,
            creatorUrl: video.user?.url,
            provenance: {
              provider: 'pexels',
              sourceId: String(video.id),
              landingPageUrl: video.url,
              creator: video.user?.name,
              creatorUrl: video.user?.url,
              license: {
                name: 'Pexels license',
                url: 'https://www.pexels.com/license/',
                attributionRequired: false,
                attributionText: video.user?.name
                  ? `Video by ${video.user.name} on Pexels`
                  : undefined,
              },
            },
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

async function searchMedia(request: MediaSearchRequest): Promise<MediaSearchResponse> {
  if (providerWorkerOrigin()) {
    try {
      return await backendRequest<MediaSearchResponse>('/api/media/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rhymx-Actor': anonymousActorId(),
        },
        body: JSON.stringify(request),
      })
    } catch (error) {
      console.warn('Hosted provider search was unavailable; using browser adapters.', error)
    }
  }
  return localMediaSearch(request)
}

async function resolveMedia(candidate: MediaCandidate) {
  if (candidate.downloadUrl) return candidate
  if (['pexels', 'wikimedia'].includes(candidate.provider)) return candidate
  if (providerWorkerOrigin()) {
    try {
      return await backendRequest<MediaCandidate>('/api/media/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Rhymx-Actor': anonymousActorId(),
        },
        body: JSON.stringify({ candidate }),
      })
    } catch (error) {
      console.warn('Hosted media resolution was unavailable; using a browser adapter.', error)
    }
  }
  if (candidate.provider === 'archive_org') return localResolveArchive(candidate)
  if (candidate.provider === 'nasa') return localResolveNasa(candidate)
  return candidate
}

async function localPexelsCandidates(request: MediaSearchRequest): Promise<MediaCandidate[]> {
  const key = apiKeyFor('pexels')
  if (!key) throw new Error('Add a Pexels API key in Settings to search Pexels locally.')
  const page = Math.max(1, request.page || 1)
  const orientation = request.orientation && request.orientation !== 'any'
    ? `&orientation=${encodeURIComponent(request.orientation)}`
    : ''
  const candidates: MediaCandidate[] = []
  if (request.kind !== 'image') {
    const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(request.query)}&per_page=16&page=${page}${orientation}`, {
      headers: { Authorization: key },
    })
    if (!response.ok) throw new Error(`Pexels video search failed (${response.status}).`)
    const body = (await response.json()) as {
      videos?: Array<{
        id: number
        duration: number
        url: string
        image?: string
        width?: number
        height?: number
        user?: { name?: string; url?: string }
        video_files?: Array<{ link: string; width?: number; height?: number; file_type?: string }>
      }>
    }
    for (const video of body.videos || []) {
      const sources = selectPexelsVideoSources(video.video_files)
      if (!sources.sourceUrl) continue
      candidates.push({
        id: String(video.id),
        provider: 'pexels',
        kind: 'video',
        title: request.query,
        thumbnailUrl: video.image || '',
        previewUrl: sources.previewSourceUrl || sources.sourceUrl,
        downloadUrl: sources.sourceUrl,
        landingPageUrl: video.url,
        width: video.width,
        height: video.height,
        durationSec: video.duration,
        creator: video.user?.name,
        creatorUrl: video.user?.url,
        compatibility: 'ready',
        license: {
          name: 'Pexels license',
          url: 'https://www.pexels.com/license/',
          attributionRequired: false,
        },
      })
    }
  }
  if (request.kind !== 'video') {
    const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(request.query)}&per_page=16&page=${page}${orientation}`, {
      headers: { Authorization: key },
    })
    if (!response.ok) throw new Error(`Pexels image search failed (${response.status}).`)
    const body = (await response.json()) as {
      photos?: Array<{
        id: number
        width?: number
        height?: number
        alt?: string
        url: string
        photographer?: string
        photographer_url?: string
        src?: { large2x?: string; large?: string; medium?: string }
      }>
    }
    for (const photo of body.photos || []) {
      const source = photo.src?.large2x || photo.src?.large || photo.src?.medium
      if (!source) continue
      candidates.push({
        id: String(photo.id),
        provider: 'pexels',
        kind: 'image',
        title: photo.alt || request.query,
        thumbnailUrl: photo.src?.medium || source,
        previewUrl: photo.src?.large || source,
        downloadUrl: source,
        landingPageUrl: photo.url,
        width: photo.width,
        height: photo.height,
        creator: photo.photographer,
        creatorUrl: photo.photographer_url,
        compatibility: 'ready',
        license: {
          name: 'Pexels license',
          url: 'https://www.pexels.com/license/',
          attributionRequired: false,
        },
      })
    }
  }
  return candidates
}

async function localPixabayCandidates(request: MediaSearchRequest): Promise<MediaCandidate[]> {
  const key = apiKeyFor('pixabay')
  if (!key) throw new Error('Add a Pixabay API key in Settings to search Pixabay locally.')
  const page = Math.max(1, request.page || 1)
  const orientation = request.orientation === 'landscape'
    ? 'horizontal'
    : request.orientation === 'portrait'
      ? 'vertical'
      : 'all'
  const license = (creator?: string) => ({
    name: 'Pixabay Content License',
    url: 'https://pixabay.com/service/license-summary/',
    attributionRequired: false,
    attributionText: creator ? `Media by ${creator} on Pixabay` : undefined,
  })
  const candidates: MediaCandidate[] = []

  if (request.kind !== 'video') {
    const endpoint = new URL('https://pixabay.com/api/')
    endpoint.search = new URLSearchParams({
      key,
      q: request.query.slice(0, 100),
      per_page: '24',
      page: String(page),
      safesearch: 'true',
      image_type: 'photo',
      orientation,
    }).toString()
    const response = await fetch(endpoint)
    if (!response.ok) throw new Error(`Pixabay image search failed (${response.status}).`)
    const body = (await response.json()) as {
      hits?: Array<{
        id: number
        tags?: string
        webformatURL?: string
        previewURL?: string
        largeImageURL?: string
        pageURL: string
        imageWidth?: number
        imageHeight?: number
        imageSize?: number
        user?: string
        user_id?: number
      }>
    }
    for (const hit of body.hits || []) {
      const source = hit.largeImageURL || hit.webformatURL
      if (!source) continue
      candidates.push({
        id: String(hit.id),
        provider: 'pixabay',
        kind: 'image',
        title: hit.tags || request.query,
        thumbnailUrl: hit.webformatURL || hit.previewURL || source,
        previewUrl: hit.webformatURL || source,
        downloadUrl: source,
        landingPageUrl: hit.pageURL,
        width: hit.imageWidth,
        height: hit.imageHeight,
        fileSizeBytes: hit.imageSize,
        creator: hit.user,
        creatorUrl: hit.user_id && hit.user
          ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/`
          : undefined,
        license: license(hit.user),
        compatibility: 'ready',
      })
    }
  }

  if (request.kind !== 'image') {
    const endpoint = new URL('https://pixabay.com/api/videos/')
    endpoint.search = new URLSearchParams({
      key,
      q: request.query.slice(0, 100),
      per_page: '24',
      page: String(page),
      safesearch: 'true',
    }).toString()
    const response = await fetch(endpoint)
    if (!response.ok) throw new Error(`Pixabay video search failed (${response.status}).`)
    const body = (await response.json()) as {
      hits?: Array<{
        id: number
        tags?: string
        pageURL: string
        duration?: number
        picture_id?: string
        user?: string
        user_id?: number
        videos?: Record<string, { url?: string; width?: number; height?: number; size?: number }>
      }>
    }
    for (const hit of body.hits || []) {
      const rendition = hit.videos?.large || hit.videos?.medium || hit.videos?.small
      const preview = hit.videos?.small || hit.videos?.medium || rendition
      if (!rendition?.url) continue
      candidates.push({
        id: String(hit.id),
        provider: 'pixabay',
        kind: 'video',
        title: hit.tags || request.query,
        thumbnailUrl: hit.picture_id
          ? `https://i.vimeocdn.com/video/${hit.picture_id}_640x360.jpg`
          : '',
        previewUrl: preview?.url || rendition.url,
        downloadUrl: rendition.url,
        landingPageUrl: hit.pageURL,
        width: rendition.width,
        height: rendition.height,
        durationSec: hit.duration,
        fileSizeBytes: rendition.size,
        creator: hit.user,
        creatorUrl: hit.user_id && hit.user
          ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/`
          : undefined,
        license: license(hit.user),
        compatibility: 'ready',
      })
    }
  }

  return candidates
}

async function localArchiveCandidates(request: MediaSearchRequest): Promise<MediaCandidate[]> {
  const endpoint = new URL('https://archive.org/advancedsearch.php')
  const mediaClause = request.kind === 'image'
    ? 'mediatype:image'
    : request.kind === 'video'
      ? 'mediatype:movies'
      : '(mediatype:movies OR mediatype:image)'
  endpoint.searchParams.set('q', `(${request.query}) AND ${mediaClause}`)
  for (const field of ['identifier', 'title', 'creator', 'mediatype', 'licenseurl']) {
    endpoint.searchParams.append('fl[]', field)
  }
  endpoint.searchParams.set('rows', '24')
  endpoint.searchParams.set('page', String(Math.max(1, request.page || 1)))
  endpoint.searchParams.set('output', 'json')
  endpoint.searchParams.append('sort[]', 'downloads desc')
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error(`Archive.org search failed (${response.status}).`)
  const body = (await response.json()) as {
    response?: {
      docs?: Array<{
        identifier: string
        title?: string
        creator?: string | string[]
        mediatype?: string
        licenseurl?: string | string[]
      }>
    }
  }
  return (body.response?.docs || []).map((item) => {
    const licenseUrl = Array.isArray(item.licenseurl) ? item.licenseurl[0] : item.licenseurl
    return {
      id: item.identifier,
      provider: 'archive_org' as const,
      kind: item.mediatype === 'image' ? 'image' as const : 'video' as const,
      title: item.title || item.identifier,
      thumbnailUrl: `https://archive.org/services/img/${encodeURIComponent(item.identifier)}`,
      previewUrl: `https://archive.org/services/img/${encodeURIComponent(item.identifier)}`,
      landingPageUrl: `https://archive.org/details/${encodeURIComponent(item.identifier)}`,
      creator: Array.isArray(item.creator) ? item.creator.join(', ') : item.creator,
      license: licenseUrl
        ? {
            name: 'Declared on Archive.org',
            url: licenseUrl,
            attributionRequired: true,
            warning: 'Review the item page because Archive.org hosts material under varied licenses.',
          }
        : {
            name: 'Unknown — verify before publishing',
            attributionRequired: true,
            warning: 'No machine-readable license was declared for this item.',
          },
      compatibility: 'resolve' as const,
    }
  })
}

async function localNasaCandidates(request: MediaSearchRequest): Promise<MediaCandidate[]> {
  const endpoint = new URL('https://images-api.nasa.gov/search')
  endpoint.searchParams.set('q', request.query)
  endpoint.searchParams.set('page', String(Math.max(1, request.page || 1)))
  if (request.kind !== 'all' && request.kind) endpoint.searchParams.set('media_type', request.kind)
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error(`NASA media search failed (${response.status}).`)
  const body = (await response.json()) as {
    collection?: {
      items?: Array<{
        data?: Array<{
          nasa_id?: string
          media_type?: string
          title?: string
          photographer?: string
          center?: string
        }>
        links?: Array<{ render?: string; href?: string }>
      }>
    }
  }
  return (body.collection?.items || []).slice(0, 24).flatMap((item) => {
    const metadata = item.data?.[0]
    if (!metadata?.nasa_id || !['image', 'video'].includes(metadata.media_type || '')) return []
    const preview = item.links?.find((link) => link.render === 'image')?.href || ''
    const kind = metadata.media_type as 'image' | 'video'
    return [{
      id: metadata.nasa_id,
      provider: 'nasa' as const,
      kind,
      title: metadata.title || metadata.nasa_id,
      thumbnailUrl: preview,
      previewUrl: preview,
      downloadUrl: kind === 'image' ? preview : undefined,
      landingPageUrl: `https://images.nasa.gov/details/${encodeURIComponent(metadata.nasa_id)}`,
      creator: metadata.photographer || metadata.center,
      license: {
        name: 'NASA media usage guidelines',
        url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
        attributionRequired: false,
        warning: 'Logos, identifiable people, endorsement, and third-party material require extra review.',
      },
      compatibility: kind === 'image' ? 'ready' as const : 'resolve' as const,
    }]
  })
}

async function localWikimediaCandidates(request: MediaSearchRequest): Promise<MediaCandidate[]> {
  if (request.kind === 'video') return []
  const images = await searchWikimedia(request.query)
  return images.map((image) => ({
    id: image.id.replace(/^wikimedia_/, ''),
    provider: 'wikimedia',
    kind: 'image',
    title: image.title,
    thumbnailUrl: image.thumbnailUrl,
    previewUrl: image.sourceUrl,
    downloadUrl: image.sourceUrl,
    landingPageUrl: `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(image.title)}`,
    compatibility: 'ready',
    license: {
      name: 'Wikimedia source metadata',
      url: 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia',
      attributionRequired: true,
      warning: 'Verify the license and attribution on the source page before publishing.',
    },
  }))
}

async function localResolveArchive(candidate: MediaCandidate): Promise<MediaCandidate> {
  const response = await fetch(`https://archive.org/metadata/${encodeURIComponent(candidate.id)}`)
  if (!response.ok) throw new Error(`Archive.org metadata lookup failed (${response.status}).`)
  const metadata = (await response.json()) as {
    files?: Array<{ name?: string; size?: string | number }>
  }
  const files = (metadata.files || []).filter(
    (file) => file.name && Number(file.size || 0) <= 500 * 1024 * 1024
  )
  const compatible = candidate.kind === 'video'
    ? files
        .filter((file) => /\.mp4$/i.test(file.name || '') && !/thumb|sample/i.test(file.name || ''))
        .sort((first, second) => Number(first.size || 0) - Number(second.size || 0))
    : files
        .filter((file) => /\.(jpe?g|png|webp)$/i.test(file.name || '') && !/thumb/i.test(file.name || ''))
        .sort((first, second) => Number(second.size || 0) - Number(first.size || 0))
  const file = compatible[0]
  if (!file?.name) throw new Error('Archive.org did not provide a browser-compatible rendition under 500 MB.')
  const encodedName = file.name.split('/').map(encodeURIComponent).join('/')
  const downloadUrl = `https://archive.org/download/${encodeURIComponent(candidate.id)}/${encodedName}`
  return {
    ...candidate,
    downloadUrl,
    previewUrl: candidate.kind === 'video' ? downloadUrl : candidate.previewUrl,
    fileSizeBytes: Number(file.size || 0),
    compatibility: 'ready',
  }
}

async function localResolveNasa(candidate: MediaCandidate): Promise<MediaCandidate> {
  if (candidate.kind === 'image' && candidate.downloadUrl) return candidate
  const response = await fetch(`https://images-api.nasa.gov/asset/${encodeURIComponent(candidate.id)}`)
  if (!response.ok) throw new Error(`NASA media lookup failed (${response.status}).`)
  const manifest = (await response.json()) as {
    collection?: { items?: Array<{ href?: string }> }
  }
  const links = (manifest.collection?.items || []).flatMap((item) => item.href ? [item.href] : [])
  const downloadUrl =
    links.find((link) => /~orig\.(mp4|webm)$/i.test(link)) ||
    links.find((link) => /\.(mp4|webm)$/i.test(link)) ||
    links.find((link) => /\.(jpe?g|png)$/i.test(link))
  if (!downloadUrl) throw new Error('NASA did not return a browser-compatible rendition for this asset.')
  return {
    ...candidate,
    downloadUrl,
    previewUrl: candidate.kind === 'video' ? downloadUrl : candidate.previewUrl,
    compatibility: 'ready',
  }
}

async function localMediaSearch(request: MediaSearchRequest): Promise<MediaSearchResponse> {
  const providers: MediaProvider[] = request.providers?.length
    ? request.providers
    : ['pexels', 'pixabay', 'archive_org', 'nasa', 'wikimedia']
  const candidates: MediaCandidate[] = []
  const errors: MediaSearchResponse['errors'] = []
  for (const provider of providers) {
    try {
      if (provider === 'pexels') candidates.push(...await localPexelsCandidates(request))
      else if (provider === 'pixabay') candidates.push(...await localPixabayCandidates(request))
      else if (provider === 'archive_org') candidates.push(...await localArchiveCandidates(request))
      else if (provider === 'nasa') candidates.push(...await localNasaCandidates(request))
      else if (provider === 'wikimedia') candidates.push(...await localWikimediaCandidates(request))
    } catch (error) {
      errors.push({ provider, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return { candidates, errors, nextPage: candidates.length ? (request.page || 1) + 1 : undefined }
}

function anonymousActorId() {
  const key = 'rhymx.anonymousActor'
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(key, id)
  return id
}

function scoreCandidate(
  candidate: MediaCandidate,
  scene: SceneSegment,
  usedProviders: Set<MediaProvider>
) {
  const queryTerms = (scene.keywords.join(' ') || scene.transcriptText)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2)
  const haystack = candidate.title.toLowerCase()
  const relevance = queryTerms.length
    ? queryTerms.filter((term) => haystack.includes(term)).length / queryTerms.length
    : 0
  const preferredType = candidate.kind === 'video' ? 15 : 6
  const orientation =
    candidate.width && candidate.height
      ? candidate.width >= candidate.height
        ? 15
        : 5
      : 7
  const resolution = Math.min(10, ((candidate.width || 640) / 1920) * 10)
  const duration = candidate.kind === 'image'
    ? 7
    : candidate.durationSec
      ? Math.max(0, 10 - Math.abs(candidate.durationSec - scene.durationSec) * 0.8)
      : 5
  const diversity = usedProviders.has(candidate.provider) ? 0 : 5
  const license = candidate.license
    ? candidate.license.warning
      ? 1
      : 5
    : 0
  return relevance * 35 + preferredType + orientation + resolution + duration + diversity + license
}

async function autoMatchScenes(
  scenes: SceneSegment[],
  providers: MediaProvider[] = [
    'pexels',
    'pixabay',
    'archive_org',
    'nasa',
    'wikimedia',
  ]
): Promise<SceneMediaMatch[]> {
  const matches: SceneMediaMatch[] = []
  const usedAssetIds = new Set<string>()
  const usedProviders = new Set<MediaProvider>()
  let matched = 0
  for (const [index, scene] of scenes.entries()) {
    const query = scene.keywords[0] || scene.transcriptText.split(/\s+/).slice(0, 8).join(' ')
    try {
      const response = await searchMedia({
        query,
        providers,
        kind: scene.suggestedTreatment === 'motion' ? 'all' : 'video',
        orientation: 'landscape',
      })
      const candidates = response.candidates
        .filter((candidate) => !usedAssetIds.has(`${candidate.provider}:${candidate.id}`))
        .map((candidate) => ({
          ...candidate,
          score: scoreCandidate(candidate, scene, usedProviders),
        }))
        .sort((first, second) => (second.score || 0) - (first.score || 0))
        .slice(0, 4)
      if (candidates[0]) {
        matched += 1
        usedAssetIds.add(`${candidates[0].provider}:${candidates[0].id}`)
        usedProviders.add(candidates[0].provider)
      }
      matches.push({
        sceneId: scene.id,
        query,
        candidates,
        confidence:
          (candidates[0]?.score || 0) >= 60
            ? 'strong'
            : candidates.length
              ? 'review'
              : 'none',
      })
    } catch {
      matches.push({ sceneId: scene.id, query, candidates: [], confidence: 'none' })
    }
    pexelsListener({
      completed: index + 1,
      total: scenes.length,
      matched,
      sceneId: scene.id,
      query,
    })
  }
  return matches
}

async function readResponseWithProgress(response: Response, candidateId: string) {
  if (!response.ok) throw new Error(`Media acquisition failed (${response.status}).`)
  const total = Number(response.headers.get('Content-Length') || 0)
  if (!response.body) return response.blob()
  const reader = response.body.getReader()
  const chunks: ArrayBuffer[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value.slice().buffer as ArrayBuffer)
    received += value.byteLength
    acquisitionListener({
      candidateId,
      percent: total ? Math.min(99, (received / total) * 100) : 45,
    })
  }
  return new Blob(chunks)
}

async function acquireMedia(candidate: MediaCandidate) {
  const resolved = candidate.downloadUrl ? candidate : await resolveMedia(candidate)
  let response: Response
  try {
    response = await fetch(resolved.downloadUrl || resolved.previewUrl)
    if (!response.ok) throw new Error('Direct acquisition failed.')
  } catch (directError) {
    const origin = providerWorkerOrigin()
    if (!origin) throw directError
    response = await fetch(`${origin}/api/media/relay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Rhymx-Actor': anonymousActorId(),
      },
      body: JSON.stringify({ candidate: resolved }),
    })
  }
  const blob = await readResponseWithProgress(response, candidate.id)
  const contentType = response.headers.get('Content-Type') || blob.type ||
    (candidate.kind === 'video' ? 'video/mp4' : 'image/jpeg')
  const extension = contentType.includes('webm')
    ? 'webm'
    : contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
        ? 'webp'
        : candidate.kind === 'video'
          ? 'mp4'
          : 'jpg'
  const file = new File([blob], `${candidate.provider}-${candidate.id}.${extension}`, { type: contentType })
  const stored = await storeAsset(
    file,
    candidate.kind,
    undefined,
    `${candidate.provider}:${candidate.id}`
  )
  acquisitionListener({ candidateId: candidate.id, percent: 100 })
  return {
    id: `${candidate.provider}:${candidate.id}`,
    name: candidate.title,
    path: stored.path,
    kind: candidate.kind,
    durationSec: candidate.durationSec,
    thumbnailUrl: candidate.thumbnailUrl,
    providerUrl: candidate.landingPageUrl,
    provenance: {
      provider: candidate.provider,
      sourceId: candidate.id,
      landingPageUrl: candidate.landingPageUrl,
      creator: candidate.creator,
      creatorUrl: candidate.creatorUrl,
      license: candidate.license,
      acquiredAt: new Date().toISOString(),
    },
  }
}

function settings(): AppSettings {
  let stored: Partial<AppSettings> = {}
  try {
    stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<AppSettings>
  } catch {
    // Invalid old settings should not keep the local editor from opening.
  }
  return {
    projectsDirectory: 'Browser storage',
    defaultProjectsDirectory: 'Browser storage',
    autoStockEnabled: stored.autoStockEnabled ?? true,
    rememberApiKeys: stored.rememberApiKeys ?? true,
    cacheSizeBytes: 0,
  }
}

function persistSettings(next: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    autoStockEnabled: next.autoStockEnabled,
    rememberApiKeys: next.rememberApiKeys,
  }))
}

async function setRememberApiKeys(remember: boolean) {
  const currentKeys = storedApiKeys()
  const next = { ...settings(), rememberApiKeys: remember }
  persistSettings(next)
  const destination = remember ? localStorage : sessionStorage
  const destinationKey = remember ? REMEMBERED_KEYS_KEY : SESSION_KEYS_KEY
  const source = remember ? sessionStorage : localStorage
  const sourceKey = remember ? SESSION_KEYS_KEY : REMEMBERED_KEYS_KEY
  if (Object.keys(currentKeys).length) destination.setItem(destinationKey, JSON.stringify(currentKeys))
  else destination.removeItem(destinationKey)
  source.removeItem(sourceKey)
  return next
}

async function testApiKey(provider: ApiKeyProvider, suppliedKey: string): Promise<ApiKeyTestResult> {
  const key = suppliedKey.trim()
  if (!key) return { ok: false, message: 'Enter a key before testing it.' }
  try {
    let response: Response
    if (provider === 'groq') {
      response = await fetch(`${GROQ_ROOT}/models`, { headers: { Authorization: `Bearer ${key}` } })
    } else if (provider === 'pexels') {
      response = await fetch('https://api.pexels.com/v1/curated?per_page=1', { headers: { Authorization: key } })
    } else if (provider === 'pixabay') {
      response = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&per_page=3&safesearch=true`)
    } else {
      response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${encodeURIComponent(key)}`)
    }
    if (response.ok) return { ok: true, message: `${providerLabel(provider)} accepted this key.` }
    let detail = ''
    try {
      const body = await response.json() as { error?: { message?: string }; message?: string }
      detail = body.error?.message || body.message || ''
    } catch {
      detail = (await response.text()).slice(0, 160)
    }
    return {
      ok: false,
      message: `${providerLabel(provider)} rejected the key (${response.status})${detail ? `: ${detail}` : '.'}`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function providerLabel(provider: ApiKeyProvider) {
  if (provider === 'groq') return 'Groq'
  if (provider === 'pexels') return 'Pexels'
  if (provider === 'pixabay') return 'Pixabay'
  return 'YouTube'
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

type LocalMotionJob = {
  id: string
  cacheKey: string
  status: 'queued' | 'rendering' | 'complete' | 'failed' | 'cancelled'
  progress: number
  message?: string
  cached?: boolean
  error?: string
  renderedAt?: string
}

function motionStatus(job: LocalMotionJob): MotionRenderProgress {
  return {
    jobId: job.id,
    status: job.status,
    progress: Math.max(0, Math.min(100, job.progress || 0)),
    message: job.message || job.error,
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 2500) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  const abort = () => controller.abort()
  init.signal?.addEventListener('abort', abort, { once: true })
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timeout)
    init.signal?.removeEventListener('abort', abort)
  }
}

async function ensureMotionSession() {
  if (motionSessionToken) return motionSessionToken
  const response = await fetchWithTimeout(`${MOTION_RENDERER_ORIGIN}/session`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Local HyperFrames renderer is unavailable (${response.status}).`)
  const body = await response.json() as { token?: string }
  if (!body.token) throw new Error('Local HyperFrames renderer did not issue a session token.')
  motionSessionToken = body.token
  return motionSessionToken
}

async function motionRequest(path: string, init: RequestInit = {}, timeoutMs = 10_000) {
  const token = await ensureMotionSession()
  const response = await fetchWithTimeout(`${MOTION_RENDERER_ORIGIN}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  }, timeoutMs)
  if (response.status === 401) motionSessionToken = ''
  return response
}

async function getMotionRendererHealth(): Promise<MotionRendererHealth> {
  try {
    const response = await fetchWithTimeout(`${MOTION_RENDERER_ORIGIN}/health`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Health check failed (${response.status}).`)
    const health = await response.json() as MotionRendererHealth
    return { ...health, available: health.available !== false }
  } catch (error) {
    return {
      available: false,
      message: error instanceof Error && error.name === 'AbortError'
        ? 'The local renderer did not respond. Start it with npm run dev:motion.'
        : 'Start the local renderer with npm run dev:motion.',
    }
  }
}

function sleepWithSignal(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    const timeout = window.setTimeout(finish, milliseconds)
    const abort = () => {
      window.clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      reject(new DOMException('Motion render cancelled.', 'AbortError'))
    }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}

async function renderMotionGraphic(request: MotionRenderRequest): Promise<MotionRenderAsset> {
  const controller = new AbortController()
  motionAbortController = controller
  let job: LocalMotionJob | null = null
  try {
    const created = await motionRequest('/renders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    }, 15_000)
    if (!created.ok) {
      const body = await created.json().catch(() => ({})) as { error?: string }
      throw new Error(body.error || `Could not start the local HyperFrames render (${created.status}).`)
    }
    job = await created.json() as LocalMotionJob
    activeMotionJobId = job.id
    motionListener(motionStatus(job))
    while (!['complete', 'failed', 'cancelled'].includes(job.status)) {
      await sleepWithSignal(500, controller.signal)
      const response = await motionRequest(`/renders/${encodeURIComponent(job.id)}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`Could not read HyperFrames render progress (${response.status}).`)
      job = await response.json() as LocalMotionJob
      motionListener(motionStatus(job))
    }
    if (job.status !== 'complete') throw new Error(job.error || job.message || 'HyperFrames render did not complete.')
    const output = await motionRequest(`/renders/${encodeURIComponent(job.id)}/output`, {
      signal: controller.signal,
      headers: { Accept: 'video/mp4' },
    }, 120_000)
    if (!output.ok) throw new Error(`Could not download the HyperFrames result (${output.status}).`)
    const blob = await output.blob()
    const file = new File([blob], `rhymx-motion-${job.cacheKey}.mp4`, { type: 'video/mp4' })
    const stored = await storeAsset(file, 'video', undefined, `hyperframes:${job.cacheKey}`)
    return {
      ...stored,
      cacheKey: job.cacheKey,
      cached: Boolean(job.cached),
      renderedAt: job.renderedAt || new Date().toISOString(),
      durationSec: request.durationSec,
      width: request.width,
      height: request.height,
      fps: request.fps,
    }
  } catch (error) {
    if (job?.id && controller.signal.aborted) {
      void motionRequest(`/renders/${encodeURIComponent(job.id)}`, { method: 'DELETE' }).catch(() => undefined)
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Motion render cancelled.')
    }
    throw error
  } finally {
    if (activeMotionJobId === job?.id) activeMotionJobId = null
    if (motionAbortController === controller) motionAbortController = null
  }
}

async function cancelMotionRender() {
  const jobId = activeMotionJobId
  motionAbortController?.abort()
  if (!jobId) return Boolean(motionAbortController)
  try {
    await motionRequest(`/renders/${encodeURIComponent(jobId)}`, { method: 'DELETE' })
  } catch {
    // Aborting the browser-side request is sufficient when the service has stopped.
  }
  return true
}

function motionRenderMatches(
  scene: SceneSegment,
  width: number,
  height: number,
  fps: number
) {
  const motion = scene.media?.motion
  return Boolean(
    motion?.renderedAssetPath &&
      motion.renderedDurationSec === scene.durationSec &&
      motion.renderedWidth === width &&
      motion.renderedHeight === height &&
      motion.renderedFps === fps
  )
}

async function prepareMotionScenes(
  scenes: SceneSegment[],
  width: number,
  height: number,
  fps: number
) {
  const prepared: SceneSegment[] = []
  for (const scene of scenes) {
    const motion = scene.media?.motion
    if (!motion || motion.engine !== 'hyperframes') {
      prepared.push(scene)
      continue
    }
    if (
      motionRenderMatches(scene, width, height, fps) &&
      motion.renderedAssetPath &&
      await fileForSource(motion.renderedAssetPath)
    ) {
      prepared.push(scene)
      continue
    }
    const asset = await renderMotionGraphic({
      templateId: motion.templateId,
      templateVersion: motion.templateVersion,
      values: motion.values,
      accentColor: motion.accentColor,
      durationSec: scene.durationSec,
      width,
      height,
      fps,
    })
    prepared.push({
      ...scene,
      media: scene.media ? {
        ...scene.media,
        motion: {
          ...motion,
          renderedAssetPath: asset.path,
          renderCacheKey: asset.cacheKey,
          renderedAt: asset.renderedAt,
          renderedDurationSec: asset.durationSec,
          renderedWidth: asset.width,
          renderedHeight: asset.height,
          renderedFps: asset.fps,
        },
      } : null,
    })
  }
  return prepared
}

async function exportVideo(request: ExportVideoRequest) {
  const { renderMediaOnWeb } = await import('@remotion/web-renderer')
  const controller = new AbortController()
  exportController = controller
  try {
    const scenes = request.motionMode === 'fallback'
      ? request.scenes
      : await prepareMotionScenes(request.scenes, request.width, request.height, 30)
    const duration = Math.max(
      ...scenes.map((scene) => scene.endTimeSec),
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
        scenes,
        subtitles: request.subtitles,
        audioPath: request.audioPath,
        audioClips: request.audioClips,
        subtitleSettings: request.subtitleSettings,
        videoTracks: request.videoTracks,
        voiceTrackSettings: request.voiceTrackSettings,
        audioTrackSettings: request.audioTrackSettings,
        mediaMode: 'export' as const,
        renderScale: request.width / 1920,
      },
    },
    inputProps: {
      scenes,
      subtitles: request.subtitles,
      audioPath: request.audioPath,
      audioClips: request.audioClips,
      subtitleSettings: request.subtitleSettings,
      videoTracks: request.videoTracks,
      voiceTrackSettings: request.voiceTrackSettings,
      audioTrackSettings: request.audioTrackSettings,
      mediaMode: 'export' as const,
      renderScale: request.width / 1920,
    },
    videoBitrate: Number.parseInt(request.videoBitrate) * 1_000_000,
    hardwareAcceleration: 'no-preference',
    pageResponsiveness: 'medium',
    outputWritable,
      signal: controller.signal,
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
    exportListener(100)
    return outputHandle?.name || request.outputPath
  } finally {
    if (exportController === controller) exportController = null
  }
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
  autoMatchScenes,
  searchMedia,
  resolveMedia,
  acquireMedia,
  onAssetAcquisitionProgress: (callback) => { acquisitionListener = callback },
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
    persistSettings(next)
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
  getPexelsKey: async () => apiKeyFor('pexels') || null,
  setPexelsKey: async (key) => { setStoredApiKey('pexels', key) },
  getPixabayKey: async () => apiKeyFor('pixabay') || null,
  setPixabayKey: async (key) => { setStoredApiKey('pixabay', key) },
  getGroqKey: async () => apiKeyFor('groq') || null,
  setGroqKey: async (key) => { setStoredApiKey('groq', key) },
  getYouTubeKey: async () => apiKeyFor('youtube') || null,
  setYouTubeKey: async (key) => { setStoredApiKey('youtube', key) },
  setRememberApiKeys,
  testApiKey,
  getMotionRendererHealth,
  renderMotionGraphic,
  cancelMotionRender,
  onMotionRenderProgress: (callback) => { motionListener = callback },
}

export function installBrowserPlatform() {
  window.rhymx = api
  void navigator.storage?.persist?.()
}
