import React, { DragEvent, FormEvent, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  AlertTriangle,
  FileAudio,
  Film,
  Globe2,
  Image as ImageIcon,
  LoaderCircle,
  Music2,
  Plus,
  Trash2,
  Upload,
  Search,
  Youtube,
} from 'lucide-react'
import {
  ImportedFile,
  LibraryAsset,
  MediaCandidate,
  MediaKind,
  MediaProvider,
} from '../../types/editor'
import { useEditorStore } from '../../store/useEditorStore'
import { localMediaUrl } from '../services/localMedia'
import { storeAsset } from '../../platform/web/browserAssets'

type MediaFilter = 'all' | 'video' | 'image' | 'audio' | 'youtube'
type MediaPanelMode = 'library' | 'stock'

const stockProviders: Array<{ id: MediaProvider; label: string }> = [
  { id: 'pexels', label: 'Pexels' },
  { id: 'pixabay', label: 'Pixabay' },
  { id: 'archive_org', label: 'Archive' },
  { id: 'nasa', label: 'NASA' },
  { id: 'wikimedia', label: 'Wiki' },
]

const videoExtensions = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi'])
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

function classify(name: string): MediaKind {
  const extension = name.split('.').pop()?.toLowerCase() || ''
  if (videoExtensions.has(extension)) return 'video'
  if (imageExtensions.has(extension)) return 'image'
  return 'music'
}

export default function MediaBin({ width = 256 }: { width?: number }) {
  const {
    mediaLibrary,
    activeSceneId,
    activeScene,
    addMediaAssets,
    removeMediaAsset,
    assignMediaToScene,
    addAudioClip,
  } = useEditorStore(
    useShallow((state) => ({
      mediaLibrary: state.mediaLibrary,
      activeSceneId: state.activeSceneId,
      activeScene: state.scenes.find((scene) => scene.id === state.activeSceneId),
      addMediaAssets: state.addMediaAssets,
      removeMediaAsset: state.removeMediaAsset,
      assignMediaToScene: state.assignMediaToScene,
      addAudioClip: state.addAudioClip,
    }))
  )
  const [panelMode, setPanelMode] = useState<MediaPanelMode>('library')
  const [filter, setFilter] = useState<MediaFilter>('all')
  const [isDragging, setIsDragging] = useState(false)
  const [stockQuery, setStockQuery] = useState('')
  const [stockProvidersSelected, setStockProvidersSelected] = useState<MediaProvider[]>(
    stockProviders.map((provider) => provider.id)
  )
  const [stockResults, setStockResults] = useState<MediaCandidate[]>([])
  const [stockErrors, setStockErrors] = useState<string[]>([])
  const [stockSearching, setStockSearching] = useState(false)
  const [stockBusyId, setStockBusyId] = useState<string | null>(null)

  useEffect(() => {
    setStockQuery(activeScene?.keywords[0] || activeScene?.transcriptText || '')
    setStockResults([])
    setStockErrors([])
  }, [activeScene?.id])

  const addFiles = async (files: ImportedFile[]) => {
    const filesWithDuration = await Promise.all(
      files.map(async (file) => ({
        ...file,
        durationSec:
          file.durationSec ??
          (file.kind === 'image'
            ? undefined
            : (await window.rhymx.getMediaDuration(file.path)) || undefined),
      }))
    )
    addMediaAssets(
      filesWithDuration.map((file) => ({
        ...file,
        id: crypto.randomUUID(),
      }))
    )
  }

  const importFiles = async () => addFiles(await window.rhymx.openMediaFiles())

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const files = await Promise.all(
      Array.from(event.dataTransfer.files).map((file) =>
        storeAsset(file, classify(file.name))
      )
    )
    await addFiles(files)
  }

  const visibleAssets = mediaLibrary.filter((asset) => {
    if (filter === 'all') return true
    if (filter === 'youtube') return asset.origin === 'youtube'
    if (filter === 'audio') return asset.kind === 'music' || asset.kind === 'sfx'
    if (filter === 'video') {
      return asset.kind === 'video' && asset.origin !== 'youtube'
    }
    return asset.kind === filter
  })

  const placeVisual = (asset: LibraryAsset) => {
    if (asset.missing) {
      alert(
        asset.missingReason ||
          'This YouTube clip file is missing. Download the clip again.'
      )
      return
    }
    if (!activeSceneId) {
      alert('Select a scene on the timeline first.')
      return
    }
    if (asset.kind !== 'image' && asset.kind !== 'video') return
    assignMediaToScene(activeSceneId, {
      id: asset.id,
      type: asset.kind === 'video' ? 'local_video' : 'local_image',
      kind: asset.kind,
      sourceUrl: asset.path,
      thumbnailUrl: asset.thumbnailUrl || asset.path,
      title: asset.name,
      sourceStartSec: 0,
      sourceDurationSec: asset.durationSec,
      providerUrl: asset.providerUrl,
      providerStartSec: asset.providerStartSec,
      imageFit: 'cover',
      enableKenBurnsEffect: asset.kind === 'image',
      missing: false,
      provenance:
        asset.provenance ||
        (asset.origin === 'youtube'
          ? {
              provider: 'youtube',
              sourceId: asset.id,
              landingPageUrl: asset.providerUrl,
            }
          : { provider: 'local', sourceId: asset.id }),
    })
  }

  const searchStock = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!stockQuery.trim() || !stockProvidersSelected.length) return
    setStockSearching(true)
    setStockErrors([])
    try {
      const response = await window.rhymx.searchMedia({
        query: stockQuery.trim(),
        providers: stockProvidersSelected,
        kind: 'all',
        orientation: 'landscape',
      })
      setStockResults(response.candidates)
      setStockErrors(
        response.errors.map((error) =>
          `${stockProviders.find((provider) => provider.id === error.provider)?.label || error.provider}: ${error.message}`
        )
      )
    } catch (error) {
      setStockResults([])
      setStockErrors([error instanceof Error ? error.message : String(error)])
    } finally {
      setStockSearching(false)
    }
  }

  const acquireStock = async (candidate: MediaCandidate, useInScene: boolean) => {
    const busyId = `${candidate.provider}:${candidate.id}`
    setStockBusyId(busyId)
    setStockErrors([])
    try {
      const asset = await window.rhymx.acquireMedia(candidate)
      addMediaAssets([asset])
      if (useInScene && activeSceneId) {
        assignMediaToScene(activeSceneId, {
          id: asset.id,
          type: candidate.kind === 'video' ? 'local_video' : 'local_image',
          kind: candidate.kind,
          sourceUrl: asset.path,
          thumbnailUrl: candidate.thumbnailUrl,
          title: candidate.title,
          durationSec: candidate.durationSec,
          sourceStartSec: 0,
          sourceDurationSec: candidate.durationSec,
          imageFit: 'cover',
          enableKenBurnsEffect: candidate.kind === 'image',
          providerUrl: candidate.landingPageUrl,
          creatorName: candidate.creator,
          creatorUrl: candidate.creatorUrl,
          provenance: asset.provenance,
        })
      } else {
        setPanelMode('library')
      }
    } catch (error) {
      setStockErrors([error instanceof Error ? error.message : String(error)])
    } finally {
      setStockBusyId(null)
    }
  }

  return (
    <aside
      onDragOver={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      style={{ width }}
      className={`shrink-0 bg-[#111319] flex flex-col min-w-0 ${
        isDragging ? 'ring-2 ring-inset ring-violet-500' : ''
      }`}
    >
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">Media</h2>
            <p className="text-[10px] text-slate-600 mt-0.5">
              {panelMode === 'library' ? `${mediaLibrary.length} imported files` : 'Pexels, Pixabay, Archive, NASA + Wikimedia'}
            </p>
          </div>
          <button
            onClick={importFiles}
            title="Import media"
            className="h-8 w-8 rounded-lg bg-violet-600 hover:bg-violet-500 flex items-center justify-center transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-black/20 p-1 mb-3">
          <button onClick={() => setPanelMode('library')} className={`rounded-md px-2 py-1.5 text-[10px] flex items-center justify-center gap-1.5 ${panelMode === 'library' ? 'bg-white/10 text-white' : 'text-slate-600 hover:text-slate-300'}`}><Film className="h-3 w-3" />Library</button>
          <button onClick={() => setPanelMode('stock')} className={`rounded-md px-2 py-1.5 text-[10px] flex items-center justify-center gap-1.5 ${panelMode === 'stock' ? 'bg-violet-500/15 text-violet-200' : 'text-slate-600 hover:text-slate-300'}`}><Globe2 className="h-3 w-3" />Free media</button>
        </div>
        {panelMode === 'library' ? <div className="flex gap-1 rounded-lg bg-black/20 p-1 overflow-x-auto custom-scrollbar">
          {(['all', 'video', 'image', 'audio'] as MediaFilter[]).map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`shrink-0 rounded-md px-2 py-1.5 text-[10px] capitalize transition-colors ${
                filter === item ? 'bg-white/10 text-white' : 'text-slate-600 hover:text-slate-300'
              }`}
            >
              {item}
            </button>
          ))}
          <button
            onClick={() => setFilter('youtube')}
            className={`shrink-0 rounded-md px-2 py-1.5 text-[10px] transition-colors ${
              filter === 'youtube'
                ? 'bg-red-500/15 text-red-300'
                : 'text-slate-600 hover:text-slate-300'
            }`}
          >
            YouTube clips
          </button>
        </div> : <form onSubmit={searchStock} className="space-y-2">
          {activeScene && activeScene.keywords.length > 0 && <div><div className="text-[8px] uppercase tracking-[.16em] text-slate-600 mb-1.5">Recommended for this scene</div><div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1">{activeScene.keywords.map((keyword) => <button type="button" key={keyword} onClick={() => setStockQuery(keyword)} className="shrink-0 rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[9px] text-violet-200">{keyword}</button>)}</div></div>}
          <div className="flex gap-1.5"><label className="relative flex-1 min-w-0"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-600" /><input value={stockQuery} onChange={(event) => setStockQuery(event.target.value)} placeholder="Search free media" className="h-9 w-full rounded-lg border border-white/10 bg-[#090b10] pl-8 pr-2 text-[10px] outline-none focus:border-violet-500/60" /></label><button disabled={stockSearching || !stockQuery.trim()} className="h-9 w-9 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 flex items-center justify-center">{stockSearching ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}</button></div>
          <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-1">{stockProviders.map((provider) => { const selected = stockProvidersSelected.includes(provider.id); return <button type="button" key={provider.id} onClick={() => setStockProvidersSelected((current) => selected ? current.filter((item) => item !== provider.id) : [...current, provider.id])} className={`shrink-0 rounded-md border px-2 py-1 text-[8px] ${selected ? 'border-violet-400/30 bg-violet-500/10 text-violet-200' : 'border-white/8 text-slate-600'}`}>{provider.label}</button> })}</div>
        </form>}
      </div>

      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        {panelMode === 'stock' ? (
          <div className="space-y-2">
            {stockErrors.length > 0 && <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-[9px] leading-4 text-amber-100">{stockErrors.join(' · ')}</div>}
            {stockResults.length === 0 ? <div className="h-36 rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center px-4 text-slate-600"><ImageIcon className="h-6 w-6 mb-2" /><span className="text-[10px]">Choose a scene keyword or search all free providers.</span></div> : stockResults.map((candidate) => { const busyId = `${candidate.provider}:${candidate.id}`; return <article key={busyId} className="rounded-xl border border-white/8 bg-black/20 overflow-hidden"><div className="relative aspect-video bg-black/40">{candidate.kind === 'video' ? <video src={candidate.previewUrl} poster={candidate.thumbnailUrl} muted controls preload="metadata" className="h-full w-full object-cover" /> : <img src={candidate.thumbnailUrl || candidate.previewUrl} alt={candidate.title} loading="lazy" className="h-full w-full object-cover" />}<span className="absolute left-1.5 top-1.5 rounded bg-black/75 px-1.5 py-1 text-[8px] capitalize">{candidate.provider.replace('_', '.')}</span></div><div className="p-2"><div className="text-[10px] text-slate-300 truncate">{candidate.title}</div><div className="mt-1 text-[8px] text-slate-600 truncate">{candidate.creator || candidate.license?.name || 'Review source details'}</div><div className="grid grid-cols-2 gap-1.5 mt-2"><button disabled={stockBusyId !== null} onClick={() => acquireStock(candidate, false)} className="rounded-md border border-white/10 bg-white/5 py-1.5 text-[8px]">{stockBusyId === busyId ? 'Saving…' : 'Media bin'}</button><button disabled={!activeSceneId || stockBusyId !== null} onClick={() => acquireStock(candidate, true)} className="rounded-md bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 py-1.5 text-[8px]">Use in scene</button></div></div></article> })}
          </div>
        ) : visibleAssets.length === 0 && filter === 'youtube' ? (
          <div className="w-full h-32 rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center px-4 text-center text-slate-600">
            <Youtube className="h-6 w-6 mb-2" />
            <span className="text-[11px]">No downloaded YouTube clips yet</span>
            <span className="mt-1 text-[9px]">
              Clips downloaded in the Inspector will stay with this project.
            </span>
          </div>
        ) : visibleAssets.length === 0 ? (
          <button
            onClick={importFiles}
            className="w-full h-32 rounded-xl border border-dashed border-white/10 hover:border-violet-500/30 flex flex-col items-center justify-center text-slate-600 hover:text-slate-400 transition-colors"
          >
            <Upload className="h-6 w-6 mb-2" />
            <span className="text-[11px]">Import or drop media</span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {visibleAssets.map((asset) => (
              <div
                key={asset.id}
                draggable={!asset.missing}
                onDragStart={(event) => {
                  if (asset.missing) {
                    event.preventDefault()
                    return
                  }
                  event.dataTransfer.effectAllowed = 'copy'
                  event.dataTransfer.setData(
                    'application/x-rhymx-media',
                    JSON.stringify(asset)
                  )
                }}
                className={`group rounded-lg border bg-black/20 overflow-hidden ${
                  asset.missing
                    ? 'border-red-500/20 cursor-not-allowed'
                    : 'border-white/5 cursor-grab active:cursor-grabbing'
                }`}
                title={
                  asset.missing
                    ? asset.missingReason
                    : 'Drag this media onto a timeline track'
                }
              >
                <button
                  onClick={() => {
                    if (asset.kind === 'video' || asset.kind === 'image') placeVisual(asset)
                  }}
                  className="relative w-full aspect-video bg-black/40 flex items-center justify-center overflow-hidden"
                  title={
                    asset.kind === 'video' || asset.kind === 'image'
                      ? 'Add to selected scene'
                      : 'Audio asset'
                  }
                >
                  {asset.origin === 'youtube' && asset.thumbnailUrl ? (
                    <img
                      src={asset.thumbnailUrl}
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  ) : asset.kind === 'image' ? (
                    <img
                      src={localMediaUrl(asset.path)}
                      className="w-full h-full object-cover"
                      alt=""
                    />
                  ) : asset.kind === 'video' ? (
                    <video
                      src={localMediaUrl(asset.path)}
                      className="w-full h-full object-cover"
                      muted
                    />
                  ) : asset.kind === 'sfx' ? (
                    <FileAudio className="h-6 w-6 text-amber-400" />
                  ) : (
                    <Music2 className="h-6 w-6 text-emerald-400" />
                  )}
                  {asset.missing && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-red-300">
                      <AlertTriangle className="h-5 w-5" />
                      <span className="mt-1 text-[8px] uppercase">File missing</span>
                    </div>
                  )}
                </button>
                <div className="p-2">
                  <div className="text-[10px] truncate text-slate-300">{asset.name}</div>
                  {(asset.kind === 'music' || asset.kind === 'sfx') && (
                    <div className="flex gap-1 mt-1.5">
                      <button
                        onClick={() => addAudioClip({ ...asset, kind: 'music' })}
                        className="flex-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 py-1 text-[8px] text-emerald-300"
                      >
                        + Music
                      </button>
                      <button
                        onClick={() => addAudioClip({ ...asset, kind: 'sfx' })}
                        className="flex-1 rounded bg-amber-500/10 hover:bg-amber-500/20 py-1 text-[8px] text-amber-300"
                      >
                        + SFX
                      </button>
                    </div>
                  )}
                  <div className="mt-1 flex items-center justify-between">
                    <span
                      className={`text-[9px] uppercase ${
                        asset.origin === 'youtube' ? 'text-red-400/80' : 'text-slate-600'
                      }`}
                    >
                      {asset.origin === 'youtube' ? 'YouTube' : asset.kind}
                    </span>
                    <button
                      onClick={() => removeMediaAsset(asset.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/5 p-3 text-[10px] text-slate-600 flex items-center gap-2">
        {panelMode === 'stock' ? <><Globe2 className="h-3 w-3" />Previews are not downloaded until you choose one</> : <><Film className="h-3 w-3" />Drag media to a track, or click to replace selected media</>}
      </div>
    </aside>
  )
}
