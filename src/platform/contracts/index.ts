import {
  ImportedFile,
  ProjectDocument,
  ProjectSummary,
} from '../../types/editor'

export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>
  load(id: string): Promise<ProjectDocument>
  save(project: ProjectDocument): Promise<void>
  delete(id: string): Promise<void>
}

export interface AssetStorage {
  import(files: File[]): Promise<ImportedFile[]>
  resolve(source: string): Promise<File | null>
}

export interface DeviceCapabilities {
  webCodecs: boolean
  opfs: boolean
  fileSystemAccess: boolean
  hardwareConcurrency: number
  storage: {
    quota?: number
    usage?: number
    persistent: boolean
  }
}

export async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
  const estimate = await navigator.storage?.estimate?.()
  const persistent = (await navigator.storage?.persisted?.()) || false
  return {
    webCodecs: 'VideoEncoder' in window && 'VideoDecoder' in window,
    opfs: Boolean(navigator.storage?.getDirectory),
    fileSystemAccess: 'showOpenFilePicker' in window,
    hardwareConcurrency: navigator.hardwareConcurrency || 1,
    storage: {
      quota: estimate?.quota,
      usage: estimate?.usage,
      persistent,
    },
  }
}

