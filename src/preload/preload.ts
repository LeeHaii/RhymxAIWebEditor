import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openAudioFile: () => ipcRenderer.invoke('open-audio-file'),
  openMediaFiles: () => ipcRenderer.invoke('open-media-files'),
  transcribeAudio: (filePath: string, apiKey: string) => ipcRenderer.invoke('transcribe-audio', filePath, apiKey),
  listProjects: () => ipcRenderer.invoke('list-projects'),
  loadProject: (projectId: string) => ipcRenderer.invoke('load-project', projectId),
  saveProject: (project: any) => ipcRenderer.invoke('save-project', project),
  trimYouTube: (url: string, startTime: number, endTime: number) => ipcRenderer.invoke('trim-youtube', url, startTime, endTime),
  searchImages: (query: string, pexelsKey?: string) =>
    ipcRenderer.invoke('search-images', query, pexelsKey),
  searchGoogleImages: (query: string, apiKey: string, searchEngineId: string) =>
    ipcRenderer.invoke('search-google-images', query, apiKey, searchEngineId),
  searchYouTube: (query: string, apiKey: string) =>
    ipcRenderer.invoke('search-youtube', query, apiKey),
  chooseExportPath: (defaultName: string) =>
    ipcRenderer.invoke('choose-export-path', defaultName),
  getEncoderCapabilities: () => ipcRenderer.invoke('get-encoder-capabilities'),
  exportVideo: (request: any) => ipcRenderer.invoke('export-video', request),
  cancelExport: () => ipcRenderer.invoke('cancel-export'),
  onExportProgress: (callback: (progress: number) => void) => {
    ipcRenderer.removeAllListeners('export-progress')
    ipcRenderer.on('export-progress', (_event, value) => callback(value))
  },
  getPexelsKey: () => ipcRenderer.invoke('get-pexels-key'),
  setPexelsKey: (key: string) => ipcRenderer.invoke('set-pexels-key', key),
  getGeminiKey: () => ipcRenderer.invoke('get-gemini-key'),
  setGeminiKey: (key: string) => ipcRenderer.invoke('set-gemini-key', key),
  getYouTubeKey: () => ipcRenderer.invoke('get-youtube-key'),
  setYouTubeKey: (key: string) => ipcRenderer.invoke('set-youtube-key', key),
  getGoogleSearchKey: () => ipcRenderer.invoke('get-google-search-key'),
  setGoogleSearchKey: (key: string) => ipcRenderer.invoke('set-google-search-key', key),
  getGoogleSearchCx: () => ipcRenderer.invoke('get-google-search-cx'),
  setGoogleSearchCx: (value: string) => ipcRenderer.invoke('set-google-search-cx', value),
})
