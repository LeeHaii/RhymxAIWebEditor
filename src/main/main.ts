import { app, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import path from 'path'
import { transcribeAudio } from './services/gemini'
import { trimYouTube } from './services/sidecar'
import { searchGoogleImages, searchImages } from './services/imageSearch'
import { searchYouTube } from './services/youtubeSearch'
import { cancelActiveExport, exportVideo } from './services/export'
import { getEncoderCapabilities } from './services/hardware'
import fs from 'fs/promises'
import { ExportVideoRequest, ProjectDocument } from '../types/editor'

let mainWindow: BrowserWindow | null = null

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
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: file: https: http: blob:;",
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
  createWindow()

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
  
  // Return the path. Real duration would be calculated using ffprobe.
  return { path: result.filePaths[0], duration: 0 }
})

ipcMain.handle('transcribe-audio', async (_, filePath: string, apiKey: string) => {
  return await transcribeAudio(filePath, apiKey)
})

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
  return result.filePaths.map((filePath) => {
    const extension = path.extname(filePath).slice(1).toLowerCase()
    return {
      path: filePath,
      name: path.basename(filePath),
      kind: videoExtensions.has(extension)
        ? 'video'
        : imageExtensions.has(extension)
          ? 'image'
          : 'music',
    }
  })
})

const getProjectsDirectory = () => path.join(app.getPath('userData'), 'projects')
const getProjectPath = (projectId: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    throw new Error('Invalid project id.')
  }
  return path.join(getProjectsDirectory(), `${projectId}.json`)
}

ipcMain.handle('list-projects', async () => {
  const directory = getProjectsDirectory()
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

ipcMain.handle('load-project', async (_, projectId: string) => {
  const contents = await fs.readFile(getProjectPath(projectId), 'utf8')
  return JSON.parse(contents) as ProjectDocument
})

ipcMain.handle('save-project', async (_, project: ProjectDocument) => {
  const directory = getProjectsDirectory()
  await fs.mkdir(directory, { recursive: true })
  const destination = getProjectPath(project.id)
  const temporary = `${destination}.tmp`
  await fs.writeFile(temporary, JSON.stringify(project, null, 2), 'utf8')
  await fs.rename(temporary, destination)
})

ipcMain.handle('trim-youtube', async (_, url: string, startTime: number, endTime: number) => {
  return await trimYouTube(url, startTime, endTime)
})

ipcMain.handle('search-images', async (_, query: string, pexelsKey?: string) => {
  return await searchImages(query, pexelsKey)
})

ipcMain.handle(
  'search-google-images',
  async (_, query: string, apiKey: string, searchEngineId: string) => {
    return await searchGoogleImages(query, apiKey, searchEngineId)
  }
)

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
ipcMain.handle('get-google-search-key', () => getSecret('googleSearch'))
ipcMain.handle('set-google-search-key', (_, key: string) => setSecret('googleSearch', key))
ipcMain.handle('get-google-search-cx', () => getSecret('googleSearchCx'))
ipcMain.handle('set-google-search-cx', (_, value: string) =>
  setSecret('googleSearchCx', value)
)
