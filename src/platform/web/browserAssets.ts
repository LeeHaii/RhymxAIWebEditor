import { ImportedFile, MediaKind } from '../../types/editor'

type AssetRecord = {
  id: string
  name: string
  kind: MediaKind
  file?: File
  handle?: FileSystemFileHandle
}

const DATABASE_NAME = 'rhymx-web'
const DATABASE_VERSION = 1
const ASSET_PREFIX = 'rhymx-asset:'
const objectUrls = new Map<string, string>()

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function openRhymxDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('projects')) {
        database.createObjectStore('projects', { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains('assets')) {
        database.createObjectStore('assets', { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function storeAsset(
  file: File,
  kind: MediaKind,
  handle?: FileSystemFileHandle
): Promise<ImportedFile> {
  const id = crypto.randomUUID()
  const record: AssetRecord = handle
    ? { id, name: file.name, kind, handle }
    : { id, name: file.name, kind, file }
  const database = await openRhymxDatabase()
  const transaction = database.transaction('assets', 'readwrite')
  await requestResult(transaction.objectStore('assets').put(record))
  const source = `${ASSET_PREFIX}${id}`
  objectUrls.set(source, URL.createObjectURL(file))
  return { path: source, name: file.name, kind }
}

async function readAsset(source: string) {
  if (!source.startsWith(ASSET_PREFIX)) return null
  const database = await openRhymxDatabase()
  const transaction = database.transaction('assets', 'readonly')
  return (await requestResult(
    transaction.objectStore('assets').get(source.slice(ASSET_PREFIX.length))
  )) as AssetRecord | undefined
}

export async function fileForSource(source: string): Promise<File | null> {
  const record = await readAsset(source)
  if (!record) return null
  if (record.handle) {
    try {
      return await record.handle.getFile()
    } catch {
      return null
    }
  }
  return record.file || null
}

export async function hydrateMediaSources(sources: string[]) {
  await Promise.all(
    [...new Set(sources.filter((source) => source.startsWith(ASSET_PREFIX)))].map(
      async (source) => {
        if (objectUrls.has(source)) return
        const file = await fileForSource(source)
        if (file) objectUrls.set(source, URL.createObjectURL(file))
      }
    )
  )
}

export function resolveMediaUrl(source: string) {
  return objectUrls.get(source) || source
}

export async function clearStoredAssets() {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
  const database = await openRhymxDatabase()
  const transaction = database.transaction('assets', 'readwrite')
  await requestResult(transaction.objectStore('assets').clear())
}

export async function storedAssetBytes() {
  const database = await openRhymxDatabase()
  const transaction = database.transaction('assets', 'readonly')
  const records = (await requestResult(
    transaction.objectStore('assets').getAll()
  )) as AssetRecord[]
  return records.reduce((total, record) => total + (record.file?.size || 0), 0)
}

