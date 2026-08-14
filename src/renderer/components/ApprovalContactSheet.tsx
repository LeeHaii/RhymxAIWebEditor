import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Plus,
  Search,
  SkipForward,
  Sparkles,
} from 'lucide-react'
import { MediaCandidate, MediaProvider, SceneMediaMatch } from '../../types/editor'
import { getProjectDocument, useEditorStore } from '../../store/useEditorStore'
import OpenMediaDialog from './OpenMediaDialog'

const candidateKey = (candidate: MediaCandidate) =>
  `${candidate.provider}:${candidate.id}`

function diversePage(
  candidates: MediaCandidate[],
  existing: Set<string>,
  limit = 4
) {
  const byProvider = new Map<MediaProvider, MediaCandidate[]>()
  for (const candidate of candidates) {
    const id = candidateKey(candidate)
    if (existing.has(id)) continue
    existing.add(id)
    const group = byProvider.get(candidate.provider) || []
    group.push(candidate)
    byProvider.set(candidate.provider, group)
  }

  const groups = [...byProvider.values()]
  const output: MediaCandidate[] = []
  while (output.length < limit && groups.some((group) => group.length)) {
    for (const group of groups) {
      const candidate = group.shift()
      if (candidate) output.push(candidate)
      if (output.length === limit) break
    }
  }
  return output
}

export default function ApprovalContactSheet() {
  const {
    scenes,
    pendingMatches,
    setPendingMatches,
    setScreen,
    setActiveSceneId,
    addMediaAssets,
    assignMediaToScene,
    setEditorNotice,
  } = useEditorStore()
  const [selected, setSelected] = useState<Record<string, MediaCandidate | null>>(
    () =>
      Object.fromEntries(
        pendingMatches.map((match) => [
          match.sceneId,
          match.confidence === 'strong' ? match.candidates[0] || null : null,
        ])
      )
  )
  const [isApplying, setIsApplying] = useState(false)
  const [completed, setCompleted] = useState(0)
  const [manualSearch, setManualSearch] = useState(false)
  const [acquisition, setAcquisition] = useState<Record<string, number>>({})
  const [loadingMore, setLoadingMore] = useState<Record<string, boolean>>({})
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    window.rhymx.onAssetAcquisitionProgress(({ candidateId, percent }) => {
      setAcquisition((current) => ({ ...current, [candidateId]: percent }))
    })
  }, [])

  const strongCount = pendingMatches.filter(
    (match) => match.confidence === 'strong'
  ).length
  const approvedCount = Object.values(selected).filter(Boolean).length
  const candidateIds = useMemo(
    () =>
      new Set(
        Object.values(selected)
          .filter(Boolean)
          .map((candidate) => candidateKey(candidate!))
      ),
    [selected]
  )

  const approveStrong = () =>
    setSelected((current) => ({
      ...current,
      ...Object.fromEntries(
        pendingMatches
          .filter((match) => match.confidence === 'strong' && match.candidates[0])
          .map((match) => [match.sceneId, match.candidates[0]])
      ),
    }))

  const loadMoreForScene = async (match: SceneMediaMatch) => {
    const scene = scenes.find((item) => item.id === match.sceneId)
    if (!scene || loadingMore[match.sceneId]) return
    setLoadingMore((current) => ({ ...current, [match.sceneId]: true }))
    setLoadErrors((current) => ({ ...current, [match.sceneId]: '' }))

    const queries = (match.queries?.length ? match.queries : scene.keywords).filter(Boolean)
    if (!queries.length) queries.push(match.query || scene.transcriptText)
    const logicalPage = match.nextPage || 2
    const queryIndex = (logicalPage - 2) % queries.length
    const providerPage = 2 + Math.floor((logicalPage - 2) / queries.length)

    try {
      const response = await window.rhymx.searchMedia({
        query: queries[queryIndex],
        kind: scene.suggestedTreatment === 'motion' ? 'all' : 'video',
        orientation: 'landscape',
        page: providerPage,
      })
      const currentMatch = useEditorStore
        .getState()
        .pendingMatches.find((item) => item.sceneId === match.sceneId)
      if (!currentMatch) return
      const existing = new Set(currentMatch.candidates.map(candidateKey))
      const additions = diversePage(response.candidates, existing)
      const nextPage = additions.length && response.nextPage ? logicalPage + 1 : 0
      setPendingMatches(
        useEditorStore.getState().pendingMatches.map((item) =>
          item.sceneId === match.sceneId
            ? {
                ...item,
                queries,
                candidates: [...item.candidates, ...additions],
                nextPage,
              }
            : item
        )
      )
      if (!additions.length) {
        setLoadErrors((current) => ({
          ...current,
          [match.sceneId]: 'No more unique matches were found for this scene.',
        }))
      }
    } catch (error) {
      setLoadErrors((current) => ({
        ...current,
        [match.sceneId]: error instanceof Error ? error.message : String(error),
      }))
    } finally {
      setLoadingMore((current) => ({ ...current, [match.sceneId]: false }))
    }
  }

  const finish = async () => {
    setIsApplying(true)
    let applied = 0
    const warnings: string[] = []
    for (const scene of scenes) {
      const candidate = selected[scene.id]
      if (!candidate) continue
      try {
        const asset = await window.rhymx.acquireMedia(candidate)
        addMediaAssets([asset])
        assignMediaToScene(scene.id, {
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
        applied += 1
      } catch (error) {
        warnings.push(
          `${candidate.provider}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
      setCompleted((current) => current + 1)
    }
    setPendingMatches([])
    setEditorNotice(
      warnings.length
        ? `Added ${applied} approved assets. ${warnings.length} could not be acquired and remain empty.`
        : `Added ${applied} approved assets. Every source is available in the attribution manager.`
    )
    setScreen('editor')
    const project = getProjectDocument()
    if (project) await window.rhymx.saveProject(project)
    setIsApplying(false)
  }

  return (
    <div className="min-h-screen bg-[#0b0d12] text-white">
      <header className="sticky top-0 z-30 min-h-20 border-b border-white/8 bg-[#0b0d12]/90 backdrop-blur-xl px-5 sm:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setScreen('new-project')}
            className="p-2 rounded-lg hover:bg-white/5 text-slate-500"
            aria-label="Back to project setup"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="text-[10px] uppercase tracking-[.2em] text-violet-300">
              Visual approval
            </div>
            <h1 className="text-lg font-semibold mt-0.5">
              Review the montage before download
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={approveStrong}
            disabled={strongCount === 0 || isApplying}
            className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2.5 text-xs flex items-center gap-2"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Approve {strongCount} strong match{strongCount === 1 ? '' : 'es'}
          </button>
          <button
            onClick={finish}
            disabled={isApplying}
            className="rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 px-4 py-2.5 text-xs font-medium flex items-center gap-2"
          >
            {isApplying ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {isApplying
              ? `Acquiring ${completed}/${approvedCount}`
              : `Continue with ${approvedCount} approved`}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 sm:px-8 py-8">
        <div className="rounded-2xl border border-violet-400/15 bg-violet-500/[.06] p-4 text-xs text-slate-400 leading-5">
          Nothing on this page has been downloaded. Preview candidates, check their
          source and license, then approve only the visuals you want in the project.
        </div>
        <div className="mt-6 space-y-5">
          {pendingMatches.map((match, sceneIndex) => {
            const scene = scenes.find((item) => item.id === match.sceneId)
            if (!scene) return null
            return (
              <section
                key={match.sceneId}
                className="rounded-3xl border border-white/8 bg-[#11131a] overflow-hidden"
              >
                <div className="p-5 border-b border-white/8 grid md:grid-cols-[130px_1fr_auto] gap-4 items-start">
                  <div>
                    <div className="text-[9px] uppercase tracking-[.16em] text-slate-600">
                      Scene {sceneIndex + 1}
                    </div>
                    <div className="mt-1 text-sm font-medium">
                      {scene.startTimeSec.toFixed(1)}-{scene.endTimeSec.toFixed(1)}s
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-slate-300 leading-6">
                      &ldquo;{scene.transcriptText}&rdquo;
                    </p>
                    {scene.visualIntent && (
                      <div className="mt-2 flex items-start gap-2 text-[10px] leading-4 text-violet-200">
                        <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{scene.visualIntent}</span>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px] text-slate-600">
                      <Search className="h-3 w-3" />
                      {(match.queries?.length ? match.queries : [match.query]).map(
                        (query) => (
                          <span
                            key={query}
                            className="rounded-full border border-white/8 bg-white/[.03] px-2 py-1"
                          >
                            {query}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[9px] ${
                      match.confidence === 'strong'
                        ? 'bg-emerald-500/10 text-emerald-200'
                        : match.confidence === 'review'
                          ? 'bg-amber-500/10 text-amber-200'
                          : 'bg-red-500/10 text-red-200'
                    }`}
                  >
                    {match.confidence === 'strong'
                      ? 'Strong match'
                      : match.confidence === 'review'
                        ? 'Needs review'
                        : 'No match'}
                  </span>
                </div>

                <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {match.candidates.map((candidate) => {
                    const chosen =
                      selected[match.sceneId]?.id === candidate.id &&
                      selected[match.sceneId]?.provider === candidate.provider
                    const duplicate = !chosen && candidateIds.has(candidateKey(candidate))
                    return (
                      <button
                        key={candidateKey(candidate)}
                        disabled={duplicate || isApplying}
                        onClick={() =>
                          setSelected((current) => ({
                            ...current,
                            [match.sceneId]: candidate,
                          }))
                        }
                        className={`text-left rounded-2xl overflow-hidden border transition-colors ${
                          chosen
                            ? 'border-violet-400 ring-1 ring-violet-400/30 bg-violet-500/10'
                            : duplicate
                              ? 'border-white/5 opacity-40'
                              : 'border-white/8 hover:border-white/20 bg-black/15'
                        }`}
                      >
                        <div className="relative aspect-video bg-black/30">
                          {candidate.kind === 'video' ? (
                            <video
                              src={candidate.previewUrl}
                              poster={candidate.thumbnailUrl}
                              muted
                              controls
                              preload="metadata"
                              className="h-full w-full object-cover"
                              onClick={(event) => event.stopPropagation()}
                            />
                          ) : (
                            <img
                              src={candidate.thumbnailUrl || candidate.previewUrl}
                              alt={candidate.title}
                              className="h-full w-full object-cover"
                            />
                          )}
                          {chosen && (
                            <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-violet-500 flex items-center justify-center">
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {acquisition[candidate.id] !== undefined &&
                            acquisition[candidate.id] < 100 && (
                              <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10">
                                <div
                                  className="h-full bg-violet-400"
                                  style={{ width: `${acquisition[candidate.id]}%` }}
                                />
                              </div>
                            )}
                        </div>
                        <div className="p-3">
                          <div className="text-[10px] font-medium truncate">
                            {candidate.title}
                          </div>
                          <div className="mt-1 text-[8px] text-slate-600 capitalize">
                            {candidate.provider.replace('_', '.')} -{' '}
                            {candidate.creator || 'Creator not listed'}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span
                              className={`rounded-full px-2 py-1 text-[8px] ${
                                candidate.license?.warning
                                  ? 'bg-amber-500/10 text-amber-200'
                                  : 'bg-emerald-500/10 text-emerald-200'
                              }`}
                            >
                              {candidate.license?.name || 'Verify license'}
                            </span>
                            <a
                              href={candidate.landingPageUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="text-slate-500 hover:text-white"
                              aria-label="Open source"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                  {match.candidates.length === 0 && (
                    <div className="sm:col-span-2 lg:col-span-4 py-8 text-center text-xs text-slate-600 flex items-center justify-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      No compatible candidate was returned.
                    </div>
                  )}
                </div>

                <div className="px-4 pb-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() =>
                      setSelected((current) => ({
                        ...current,
                        [match.sceneId]: null,
                      }))
                    }
                    className="rounded-lg border border-white/8 px-3 py-2 text-[9px] text-slate-500 hover:text-white flex items-center gap-1.5"
                  >
                    <SkipForward className="h-3 w-3" />
                    Skip scene
                  </button>
                  <button
                    onClick={() => {
                      setActiveSceneId(match.sceneId)
                      setManualSearch(true)
                    }}
                    className="rounded-lg border border-white/8 px-3 py-2 text-[9px] text-slate-500 hover:text-white flex items-center gap-1.5"
                  >
                    <Search className="h-3 w-3" />
                    Search manually
                  </button>
                  {match.nextPage !== 0 && (
                    <button
                      onClick={() => void loadMoreForScene(match)}
                      disabled={loadingMore[match.sceneId] || isApplying}
                      className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[9px] text-emerald-200 hover:bg-emerald-500/15 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {loadingMore[match.sceneId] ? (
                        <LoaderCircle className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      {loadingMore[match.sceneId] ? 'Finding more...' : 'Load 4 more'}
                    </button>
                  )}
                  {loadErrors[match.sceneId] && (
                    <span className="text-[9px] text-amber-300">
                      {loadErrors[match.sceneId]}
                    </span>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </main>
      {manualSearch && <OpenMediaDialog onClose={() => setManualSearch(false)} />}
    </div>
  )
}
