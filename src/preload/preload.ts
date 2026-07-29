import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openAudioFile: () => ipcRenderer.invoke('open-audio-file'),
  openMediaFiles: () => ipcRenderer.invoke('open-media-files'),
  transcribeAudio: (filePath: string, apiKey: string) => ipcRenderer.invoke('transcribe-audio', filePath, apiKey),
  listProjects: () => ipcRenderer.invoke('list-projects'),
  loadProject: (projectId: string) => ipcRenderer.invoke('load-project', projectId),
  saveProject: (project: any) => ipcRenderer.invoke('save-project', project),
  trimYouTube: (url: string, startTime: number, endTime: number) => ipcRenderer.invoke('trim-youtube', url, startTime, endTime),
  searchImages: (query: string) => ipcRenderer.invoke('search-images', query),
  exportVideo: (scenes: any[], audioPath: string, audioClips?: any[], subtitleSettings?: any) =>
    ipcRenderer.invoke('export-video', scenes, audioPath, audioClips, subtitleSettings),
  onExportProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('export-progress', (_event, value) => callback(value))
  },
  getPexelsKey: () => ipcRenderer.invoke('get-pexels-key'),
  setPexelsKey: (key: string) => ipcRenderer.invoke('set-pexels-key', key),
  getGeminiKey: () => ipcRenderer.invoke('get-gemini-key'),
  setGeminiKey: (key: string) => ipcRenderer.invoke('set-gemini-key', key),
})
