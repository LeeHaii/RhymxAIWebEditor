import React, { FormEvent, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Download, ExternalLink, Image as ImageIcon, LoaderCircle, Search, Video, X } from 'lucide-react'
import { MediaCandidate, MediaProvider } from '../../types/editor'
import { useEditorStore } from '../../store/useEditorStore'

const providers: Array<{ id: MediaProvider; label: string }> = [
  { id: 'pexels', label: 'Pexels' },
  { id: 'pixabay', label: 'Pixabay' },
  { id: 'archive_org', label: 'Archive.org' },
  { id: 'nasa', label: 'NASA' },
  { id: 'wikimedia', label: 'Wikimedia' },
]

function licenseStyle(candidate: MediaCandidate) {
  const license = candidate.license
  if (!license || license.warning) return 'bg-amber-500/15 text-amber-200'
  if (license.shareAlike) return 'bg-sky-500/15 text-sky-200'
  return license.attributionRequired ? 'bg-violet-500/15 text-violet-200' : 'bg-emerald-500/15 text-emerald-200'
}

export default function OpenMediaDialog({ onClose }: { onClose: () => void }) {
  const activeSceneId = useEditorStore((state) => state.activeSceneId)
  const activeScene = useEditorStore((state) => state.scenes.find((scene) => scene.id === state.activeSceneId))
  const addMediaAssets = useEditorStore((state) => state.addMediaAssets)
  const assignMediaToScene = useEditorStore((state) => state.assignMediaToScene)
  const [query, setQuery] = useState(activeScene?.keywords[0] || activeScene?.transcriptText || '')
  const [kind, setKind] = useState<'all' | 'image' | 'video'>('all')
  const [orientation, setOrientation] = useState<'any' | 'landscape' | 'portrait' | 'square'>('landscape')
  const [selectedProviders, setSelectedProviders] = useState<MediaProvider[]>(providers.map((provider) => provider.id))
  const [results, setResults] = useState<MediaCandidate[]>([])
  const [errors, setErrors] = useState<Array<{ provider: MediaProvider; message: string }>>([])
  const [isSearching, setIsSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [page, setPage] = useState(1)

  useEffect(() => {
    window.rhymx.onAssetAcquisitionProgress(({ candidateId, percent }) => {
      setProgress((current) => ({ ...current, [candidateId]: percent }))
    })
  }, [])

  const canSearch = query.trim() && selectedProviders.length > 0

  const search = async (event?: FormEvent, nextPage = 1) => {
    event?.preventDefault()
    if (!canSearch) return
    setIsSearching(true)
    try {
      const response = await window.rhymx.searchMedia({
        query: query.trim(),
        providers: selectedProviders,
        kind,
        orientation,
        page: nextPage,
      })
      setResults(nextPage === 1 ? response.candidates : [...results, ...response.candidates])
      setErrors(response.errors)
      setPage(nextPage)
    } catch (error) {
      setErrors([{ provider: selectedProviders[0], message: error instanceof Error ? error.message : String(error) }])
    } finally {
      setIsSearching(false)
    }
  }

  const acquire = async (candidate: MediaCandidate, useNow: boolean) => {
    setBusyId(candidate.id)
    try {
      const asset = await window.rhymx.acquireMedia(candidate)
      addMediaAssets([asset])
      if (useNow && activeSceneId) {
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
        onClose()
      }
    } catch (error) {
      setErrors((current) => [...current, { provider: candidate.provider, message: error instanceof Error ? error.message : String(error) }])
    } finally {
      setBusyId(null)
    }
  }

  const providerErrorSummary = useMemo(
    () => errors.map((error) => `${providers.find((provider) => provider.id === error.provider)?.label || error.provider}: ${error.message}`).join(' · '),
    [errors]
  )

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="media-title">
      <div className="w-full max-w-7xl h-[90vh] rounded-3xl border border-white/10 bg-[#101219] shadow-2xl flex flex-col overflow-hidden">
        <header className="p-5 border-b border-white/8 flex items-start justify-between gap-4">
          <div><div className="text-[10px] uppercase tracking-[.22em] text-violet-300">Free media</div><h2 id="media-title" className="text-xl font-semibold mt-1">Search across open sources</h2><p className="text-xs text-slate-500 mt-1">Preview first. Rhymx downloads only what you choose and keeps its source record.</p></div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-slate-400" aria-label="Close free media"><X className="h-5 w-5" /></button>
        </header>
        <form onSubmit={(event) => search(event, 1)} className="p-4 border-b border-white/8 bg-black/10 space-y-3">
          <div className="flex flex-col md:flex-row gap-2">
            <label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-600" /><span className="sr-only">Search free media</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search footage and images" className="w-full h-10 rounded-xl border border-white/10 bg-[#090b10] pl-10 pr-3 text-xs outline-none focus:border-violet-500/60" /></label>
            <select aria-label="Media type" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="h-10 rounded-xl border border-white/10 bg-[#090b10] px-3 text-xs"><option value="all">Video + images</option><option value="video">Video</option><option value="image">Images</option></select>
            <select aria-label="Orientation" value={orientation} onChange={(event) => setOrientation(event.target.value as typeof orientation)} className="h-10 rounded-xl border border-white/10 bg-[#090b10] px-3 text-xs"><option value="any">Any orientation</option><option value="landscape">Landscape</option><option value="portrait">Portrait</option><option value="square">Square</option></select>
            <button disabled={!canSearch || isSearching} className="h-10 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 px-5 text-xs font-medium flex items-center justify-center gap-2">{isSearching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Search</button>
          </div>
          <div className="flex flex-wrap gap-2">{providers.map((provider) => { const selected = selectedProviders.includes(provider.id); return <button type="button" key={provider.id} onClick={() => setSelectedProviders((current) => selected ? current.filter((item) => item !== provider.id) : [...current, provider.id])} className={`rounded-full border px-3 py-1.5 text-[10px] flex items-center gap-1.5 ${selected ? 'border-violet-400/40 bg-violet-500/10 text-violet-100' : 'border-white/8 text-slate-600'}`}>{selected && <Check className="h-3 w-3" />}{provider.label}</button> })}</div>
        </form>
        {errors.length > 0 && <div className="mx-4 mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 flex items-start gap-2 text-[10px] text-amber-100"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{providerErrorSummary}. Other providers may still have returned results.</span></div>}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
          {results.length === 0 ? <div className="h-full min-h-48 flex flex-col items-center justify-center text-center text-slate-600"><ImageIcon className="h-8 w-8 mb-3" /><div className="text-sm">Search Pexels, Pixabay, Archive.org, NASA, and Wikimedia</div><div className="text-[10px] mt-1 max-w-md">License status is shown per result. Always review warnings before commercial publication.</div></div> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{results.map((candidate) => <article key={`${candidate.provider}:${candidate.id}`} className="rounded-2xl border border-white/8 bg-white/[.025] overflow-hidden group"><div className="relative aspect-video bg-black/30 overflow-hidden">{candidate.kind === 'video' ? <video src={candidate.previewUrl} poster={candidate.thumbnailUrl} muted controls preload="metadata" className="w-full h-full object-cover" /> : <img src={candidate.thumbnailUrl || candidate.previewUrl} alt={candidate.title} loading="lazy" className="w-full h-full object-cover" />}<span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-[9px] capitalize">{candidate.provider.replace('_', '.')}</span><span className="absolute right-2 top-2 rounded-md bg-black/70 p-1.5">{candidate.kind === 'video' ? <Video className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}</span></div><div className="p-3"><div className="text-xs font-medium truncate">{candidate.title}</div><div className="text-[9px] text-slate-600 mt-1 truncate">{candidate.creator || 'Creator not listed'}{candidate.width && candidate.height ? ` · ${candidate.width}×${candidate.height}` : ''}{candidate.durationSec ? ` · ${Math.round(candidate.durationSec)}s` : ''}</div><div className="flex items-center justify-between gap-2 mt-2"><span className={`rounded-full px-2 py-1 text-[8px] truncate ${licenseStyle(candidate)}`}>{candidate.license?.name || 'Unknown license'}</span><a href={candidate.landingPageUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white" aria-label={`Open source for ${candidate.title}`}><ExternalLink className="h-3.5 w-3.5" /></a></div><div className="grid grid-cols-2 gap-2 mt-3"><button disabled={busyId !== null} onClick={() => acquire(candidate, false)} className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 py-2 text-[9px] flex items-center justify-center gap-1"><Download className="h-3 w-3" />{busyId === candidate.id ? `${Math.round(progress[candidate.id] || 0)}%` : 'Media bin'}</button><button disabled={!activeSceneId || busyId !== null} onClick={() => acquire(candidate, true)} className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 py-2 text-[9px]">Use in scene</button></div></div></article>)}</div>}
          {results.length > 0 && <button onClick={() => search(undefined, page + 1)} disabled={isSearching} className="mx-auto mt-5 block rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-5 py-2.5 text-xs">Load more</button>}
        </div>
      </div>
    </div>
  )
}
