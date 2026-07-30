import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  session,
} from 'electron'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { transcribeAudio } from './services/gemini'
import { trimYouTube } from './services/sidecar'
import { searchDuckDuckGoImages, searchImages } from './services/imageSearch'
import { searchYouTube } from './services/youtubeSearch'
import { getMediaDuration } from './services/mediaMetadata'
import { autoMatchPexelsVideos } from './services/pexelsAutoMatch'
import {
  registerLocalMediaProtocol,
  registerLocalMediaScheme,
} from './services/localMediaProtocol'
import { cancelActiveExport, exportVideo } from './services/export'
import { getEncoderCapabilities } from './services/hardware'
import fs from 'fs/promises'
import {
  AppSettings,
  BatchExportRequest,
  BatchExportResult,
  ExportVideoRequest,
  ProjectDocument,
} from '../types/editor'

let mainWindow: BrowserWindow | null = null
let batchExportCancelled = false

registerLocalMediaScheme()

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webSecurity: false, // For loading local file:// URIs in development
      devTools: false,
    },
  })

  // Set CSP to allow local files and images
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: file: rhymx-media: https: http: blob:;",
        ]
      }
    })
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerLocalMediaProtocol().then(createWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// --- IPC Handlers ---

ipcMain.handle('open-audio-file', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'webm'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  
  const filePath = result.filePaths[0]
  return { path: filePath, duration: (await getMediaDuration(filePath)) || 0 }
})

ipcMain.handle('get-media-duration', async (_, filePath: string) => {
  return await getMediaDuration(filePath)
})

ipcMain.handle('transcribe-audio', async (_, filePath: string, apiKey: string) => {
  return await transcribeAudio(filePath, apiKey)
})

ipcMain.handle(
  'auto-match-pexels-videos',
  async (_, scenes: ProjectDocument['scenes'], apiKey: string) => {
    return await autoMatchPexelsVideos(scenes, apiKey, (progress) => {
      mainWindow?.webContents.send('pexels-auto-match-progress', progress)
    })
  }
)

ipcMain.handle('open-media-files', async () => {
  if (!mainWindow) return []
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Media',
        extensions: [
          'mp4', 'mov', 'mkv', 'webm', 'avi',
          'png', 'jpg', 'jpeg', 'webp', 'gif',
          'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus',
        ],
      },
    ],
  })
  if (result.canceled) return []

  const videoExtensions = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi'])
  const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])
  return await Promise.all(result.filePaths.map(async (filePath) => {
    const extension = path.extname(filePath).slice(1).toLowerCase()
    const kind = videoExtensions.has(extension)
      ? 'video'
      : imageExtensions.has(extension)
        ? 'image'
        : 'music'
    return {
      path: filePath,
      name: path.basename(filePath),
      kind,
      durationSec: kind === 'image' ? undefined : (await getMediaDuration(filePath)) || undefined,
    }
  }))
})

type PersistedPreferences = {
  projectsDirectory?: string
  autoStockEnabled?: boolean
}

let preferencesCache: PersistedPreferences | null = null
const getDefaultProjectsDirectory = () => path.join(app.getPath('userData'), 'projects')
const getAppCacheDirectory = () => path.join(app.getPath('userData'), 'cache')
const getPreferencesPath = () => path.join(app.getPath('userData'), 'preferences.json')

async function getPreferences(): Promise<PersistedPreferences> {
  if (preferencesCache) return preferencesCache
  try {
    preferencesCache = JSON.parse(
      await fs.readFile(getPreferencesPath(), 'utf8')
    ) as PersistedPreferences
  } catch {
    preferencesCache = {}
  }
  return preferencesCache
}

async function savePreferences(updates: Partial<PersistedPreferences>) {
  const preferences = { ...(await getPreferences()), ...updates }
  preferencesCache = preferences
  await fs.mkdir(path.dirname(getPreferencesPath()), { recursive: true })
  await fs.writeFile(getPreferencesPath(), JSON.stringify(preferences, null, 2), 'utf8')
  return preferences
}

async function getProjectsDirectory() {
  const preferences = await getPreferences()
  return preferences.projectsDirectory || getDefaultProjectsDirectory()
}

async function getProjectPath(projectId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    throw new Error('Invalid project id.')
  }
  return path.join(await getProjectsDirectory(), `${projectId}.json`)
}

async function directorySize(directory: string): Promise<number> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    const sizes = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name)
        if (entry.isDirectory()) return directorySize(entryPath)
        if (entry.isFile()) return (await fs.stat(entryPath)).size
        return 0
      })
    )
    return sizes.reduce((sum, size) => sum + size, 0)
  } catch {
    return 0
  }
}

async function appSettings(): Promise<AppSettings> {
  const preferences = await getPreferences()
  return {
    projectsDirectory: await getProjectsDirectory(),
    defaultProjectsDirectory: getDefaultProjectsDirectory(),
    autoStockEnabled: preferences.autoStockEnabled ?? true,
    cacheSizeBytes: await directorySize(getAppCacheDirectory()),
  }
}

ipcMain.handle('list-projects', async () => {
  const directory = await getProjectsDirectory()
  await fs.mkdir(directory, { recursive: true })
  const files = await fs.readdir(directory)
  const projects = await Promise.all(
    files
      .filter((file) => file.endsWith('.json'))
      .map(async (file) => {
        try {
          const project = JSON.parse(
            await fs.readFile(path.join(directory, file), 'utf8')
          ) as ProjectDocument
          return {
            id: project.id,
            name: project.name,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            duration: project.audioFile?.duration || 0,
            sceneCount: project.scenes?.length || 0,
          }
        } catch (error) {
          console.warn(`Skipping unreadable project file: ${file}`, error)
          return null
        }
      })
  )

  return projects
    .filter((project): project is NonNullable<typeof project> => Boolean(project))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
})

async function loadProjectDocument(projectId: string) {
  const contents = await fs.readFile(await getProjectPath(projectId), 'utf8')
  const project = JSON.parse(contents) as ProjectDocument
  await Promise.all([
    ...(project.mediaLibrary || []).map(async (asset) => {
      if (asset.kind === 'image' || asset.durationSec) return
      asset.durationSec = (await getMediaDuration(asset.path)) || undefined
    }),
    ...(project.audioClips || []).map(async (clip) => {
      if (clip.sourceDurationSec) return
      clip.sourceDurationSec = (await getMediaDuration(clip.path)) || undefined
      clip.sourceStartSec = clip.sourceStartSec ?? 0
    }),
    ...(project.scenes || []).map(async (scene) => {
      const media = scene.media
      if (
        !media ||
        media.sourceDurationSec ||
        media.type === 'local_image' ||
        media.type === 'google_image' ||
        media.type === 'duckduckgo_image' ||
        /^(https?:|data:|blob:)/.test(media.sourceUrl)
      ) {
        return
      }
      const mediaPath = media.sourceUrl.startsWith('file:')
        ? fileURLToPath(media.sourceUrl)
        : media.sourceUrl
      media.sourceDurationSec = (await getMediaDuration(mediaPath)) || undefined
      media.sourceStartSec = media.sourceStartSec ?? 0
    }),
  ])
  return project
}

ipcMain.handle('load-project', async (_, projectId: string) => {
  return await loadProjectDocument(projectId)
})

ipcMain.handle('save-project', async (_, project: ProjectDocument) => {
  const directory = await getProjectsDirectory()
  await fs.mkdir(directory, { recursive: true })
  const destination = await getProjectPath(project.id)
  const temporary = `${destination}.tmp`
  await fs.writeFile(temporary, JSON.stringify(project, null, 2), 'utf8')
  await fs.rename(temporary, destination)
})

ipcMain.handle('get-app-settings', () => appSettings())

ipcMain.handle('choose-projects-directory', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose project storage folder',
    defaultPath: await getProjectsDirectory(),
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const directory = path.resolve(result.filePaths[0])
  await fs.mkdir(directory, { recursive: true })
  const testPath = path.join(directory, `.rhymx-write-test-${Date.now()}`)
  await fs.writeFile(testPath, 'ok', 'utf8')
  await fs.unlink(testPath)
  await savePreferences({ projectsDirectory: directory })
  return await appSettings()
})

ipcMain.handle('reset-projects-directory', async () => {
  await savePreferences({ projectsDirectory: undefined })
  await fs.mkdir(getDefaultProjectsDirectory(), { recursive: true })
  return await appSettings()
})

ipcMain.handle('set-auto-stock-enabled', async (_, enabled: boolean) => {
  await savePreferences({ autoStockEnabled: Boolean(enabled) })
  return await appSettings()
})

ipcMain.handle('clear-cache', async () => {
  await session.defaultSession.clearCache()
  const cacheDirectory = path.resolve(getAppCacheDirectory())
  const userDataDirectory = path.resolve(app.getPath('userData'))
  if (
    cacheDirectory !== userDataDirectory &&
    cacheDirectory.startsWith(`${userDataDirectory}${path.sep}`)
  ) {
    await fs.rm(cacheDirectory, { recursive: true, force: true })
    await fs.mkdir(cacheDirectory, { recursive: true })
  }
  return await appSettings()
})

ipcMain.handle('trim-youtube', async (_, url: string, startTime: number, endTime: number) => {
  return await trimYouTube(url, startTime, endTime, getAppCacheDirectory())
})

ipcMain.handle('search-images', async (_, query: string, pexelsKey?: string) => {
  return await searchImages(query, pexelsKey)
})

ipcMain.handle('search-duckduckgo-images', async (_, query: string) => {
  return await searchDuckDuckGoImages(query)
})

ipcMain.handle('search-youtube', async (_, query: string, apiKey: string) => {
  return await searchYouTube(query, apiKey)
})

ipcMain.handle('choose-export-path', async (_, defaultName: string) => {
  if (!mainWindow) return null
  const safeName = `${path.basename(defaultName || 'AI Video', path.extname(defaultName || ''))}.mp4`
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export video',
    defaultPath: path.join(app.getPath('videos'), safeName),
    filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
  })
  return result.canceled ? null : result.filePath || null
})

ipcMain.handle('get-encoder-capabilities', () => getEncoderCapabilities())
ipcMain.handle('cancel-export', () => cancelActiveExport())

ipcMain.handle('export-video', async (_, request: ExportVideoRequest) => {
  return await exportVideo(request, (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('export-progress', progress)
    }
  })
})

ipcMain.handle('choose-batch-export-directory', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose batch export folder',
    defaultPath: app.getPath('videos'),
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : result.filePaths[0] || null
})

async function availableOutputPath(directory: string, projectName: string) {
  const safeName =
    projectName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'AI Video'
  let suffix = 1
  while (true) {
    const candidate = path.join(
      directory,
      `${safeName}${suffix === 1 ? '' : ` (${suffix})`}.mp4`
    )
    try {
      await fs.access(candidate)
      suffix += 1
    } catch {
      return candidate
    }
  }
}

ipcMain.handle(
  'batch-export-projects',
  async (_, request: BatchExportRequest): Promise<BatchExportResult> => {
    batchExportCancelled = false
    await fs.mkdir(request.outputDirectory, { recursive: true })
    const result: BatchExportResult = { completed: [], failed: [], cancelled: false }

    for (let index = 0; index < request.projectIds.length; index += 1) {
      if (batchExportCancelled) break
      const projectId = request.projectIds[index]
      let projectName = projectId

      try {
        const project = await loadProjectDocument(projectId)
        projectName = project.name
        if (!project.audioFile) throw new Error('Project has no voiceover audio.')
        const outputPath = await availableOutputPath(
          request.outputDirectory,
          project.name
        )
        const notify = (
          projectProgress: number,
          status:
            | 'preparing'
            | 'rendering'
            | 'completed'
            | 'failed'
            | 'cancelled',
          message?: string
        ) => {
          mainWindow?.webContents.send('batch-export-progress', {
            projectId,
            projectName: project.name,
            projectIndex: index,
            totalProjects: request.projectIds.length,
            projectProgress,
            status,
            message,
          })
        }

        notify(0, 'preparing')
        await exportVideo(
          {
            scenes: project.scenes,
            audioPath: project.audioFile.path,
            audioClips: project.audioClips || [],
            subtitleSettings: project.subtitleSettings,
            subtitles: project.subtitles || [],
            videoTracks: project.videoTracks || [],
            voiceTrackSettings: project.voiceTrackSettings || {
              muted: false,
              visible: true,
            },
            audioTrackSettings: project.audioTrackSettings || {
              muted: false,
              visible: true,
            },
            outputPath,
            width: request.width,
            height: request.height,
            videoBitrate: request.videoBitrate,
            encoder: request.encoder,
          },
          (progress) => notify(progress, 'rendering')
        )
        result.completed.push({ projectId, outputPath })
        notify(100, 'completed', outputPath)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (batchExportCancelled) {
          mainWindow?.webContents.send('batch-export-progress', {
            projectId,
            projectName,
            projectIndex: index,
            totalProjects: request.projectIds.length,
            projectProgress: 0,
            status: 'cancelled',
            message: 'Batch export cancelled.',
          })
          break
        }
        result.failed.push({ projectId, error: message })
        mainWindow?.webContents.send('batch-export-progress', {
          projectId,
          projectName,
          projectIndex: index,
          totalProjects: request.projectIds.length,
          projectProgress: 0,
          status: 'failed',
          message,
        })
      }
    }

    result.cancelled = batchExportCancelled
    batchExportCancelled = false
    return result
  }
)

ipcMain.handle('cancel-batch-export', () => {
  batchExportCancelled = true
  cancelActiveExport()
  return true
})

const configStore: Record<string, string> = {}
const getSettingsPath = () => path.join(app.getPath('userData'), 'settings.json')

async function getSecret(name: string) {
  if (configStore[name]) return configStore[name]
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const settings = JSON.parse(await fs.readFile(getSettingsPath(), 'utf8')) as Record<string, string>
    if (!settings[name]) return null
    const value = safeStorage.decryptString(Buffer.from(settings[name], 'base64'))
    configStore[name] = value
    return value
  } catch {
    return null
  }
}

async function setSecret(name: string, value: string) {
  configStore[name] = value
  if (!safeStorage.isEncryptionAvailable()) return
  let settings: Record<string, string> = {}
  try {
    settings = JSON.parse(await fs.readFile(getSettingsPath(), 'utf8'))
  } catch {
    // The settings file is created on the first saved key.
  }
  settings[name] = safeStorage.encryptString(value).toString('base64')
  await fs.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8')
}

ipcMain.handle('get-pexels-key', () => getSecret('pexels'))
ipcMain.handle('set-pexels-key', (_, key: string) => setSecret('pexels', key))
ipcMain.handle('get-gemini-key', () => getSecret('gemini'))
ipcMain.handle('set-gemini-key', (_, key: string) => setSecret('gemini', key))
ipcMain.handle('get-youtube-key', () => getSecret('youtube'))
ipcMain.handle('set-youtube-key', (_, key: string) => setSecret('youtube', key))
