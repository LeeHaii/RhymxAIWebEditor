import React, { useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle, Minus, Plus } from 'lucide-react'
import { Player, PlayerRef } from '@remotion/player'
import { MainComposition } from '../../remotion/Composition'
import { useEditorStore } from '../../store/useEditorStore'
import { SceneSegment } from '../../types/editor'
import {
  getScrubSnapshot,
  subscribeToScrub,
} from '../playback/scrubController'

const QUALITY_SIZES = {
  low: { width: 640, height: 360 },
  medium: { width: 1280, height: 720 },
  high: { width: 1920, height: 1080 },
  ultra: { width: 3840, height: 2160 },
} as const

const CLOCK_UPDATE_INTERVAL_MS = 100
const SCRUB_PREVIEW_INTERVAL_MS = 1000 / 12

const mediaSignature = (scene: SceneSegment) =>
  scene.media
    ? `${scene.media.type}\u0000${scene.media.sourceUrl}\u0000${
        scene.media.previewSourceUrl || ''
      }\u0000${scene.media.sourceStartSec ?? 0}`
    : ''

const isVideoScene = (scene: SceneSegment) =>
  scene.media?.type === 'remote_video' || scene.media?.type === 'local_video'

const nextPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  )

async function waitForSceneMedia(
  container: HTMLDivElement | null,
  scene: SceneSegment,
  timeoutMs = 2500
) {
  if (!scene.media) return
  const deadline = performance.now() + timeoutMs

  while (performance.now() < deadline) {
    const sceneNode = Array.from(
      container?.querySelectorAll<HTMLElement>('[data-rhymx-scene-id]') || []
    ).find((node) => node.dataset.rhymxSceneId === scene.id)
    if (isVideoScene(scene)) {
      const video = sceneNode?.querySelector('video')
      if (
        video &&
        !video.seeking &&
        video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
      ) {
        return
      }
    } else {
      const image = sceneNode?.querySelector('img')
      if (image?.complete && image.naturalWidth > 0) return
    }
    await nextPaint()
  }
}

export default function PlayerCanvas() {
  // Keep playback-clock updates from re-rendering the Player and recreating
  // every active media element. This is especially important with overlays.
  const scenes = useEditorStore((state) => state.scenes)
  const videoTracks = useEditorStore((state) => state.videoTracks)
  const voiceTrackSettings = useEditorStore((state) => state.voiceTrackSettings)
  const audioTrackSettings = useEditorStore((state) => state.audioTrackSettings)
  const subtitles = useEditorStore((state) => state.subtitles)
  const audioFile = useEditorStore((state) => state.audioFile)
  const audioClips = useEditorStore((state) => state.audioClips)
  const subtitleSettings = useEditorStore((state) => state.subtitleSettings)
  const seekTargetSec = useEditorStore((state) => state.seekTargetSec)
  const seekVersion = useEditorStore((state) => state.seekVersion)
  const playbackCommand = useEditorStore((state) => state.playbackCommand)
  const playbackVersion = useEditorStore((state) => state.playbackVersion)
  const setCurrentTimeSec = useEditorStore((state) => state.setCurrentTimeSec)
  const setIsPlaying = useEditorStore((state) => state.setIsPlaying)
  const playerRef = useRef<PlayerRef>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const scenesRef = useRef(scenes)
  const previousMediaRef = useRef<Map<string, string> | null>(null)
  const mediaRefreshVersionRef = useRef(0)
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [fitWidth, setFitWidth] = useState(960)
  const [isRefreshingMedia, setIsRefreshingMedia] = useState(false)
  const [quality, setQuality] = useState<'low' | 'medium' | 'high' | 'ultra'>(
    () =>
      (localStorage.getItem('rhymx.previewQuality') as
        | 'low'
        | 'medium'
        | 'high'
        | 'ultra') || 'medium'
  )
  const qualitySize = QUALITY_SIZES[quality]
  scenesRef.current = scenes

  const totalDurationSec = useMemo(() => {
    const sceneEnd = scenes.reduce((max, scene) => Math.max(max, scene.endTimeSec), 0)
    const subtitleEnd = subtitles.reduce(
      (max, subtitle) => Math.max(max, subtitle.endTimeSec),
      0
    )
    const clipEnd = audioClips.reduce(
      (max, clip) => Math.max(max, clip.startTimeSec + clip.durationSec),
      0
    )
    return Math.max(audioFile?.duration || 0, sceneEnd, subtitleEnd, clipEnd, 10)
  }, [audioFile?.duration, scenes, subtitles, audioClips])
  const durationInFrames = Math.max(1, Math.round(totalDurationSec * 30))
  const inputProps = useMemo(
    () => ({
      scenes,
      videoTracks,
      voiceTrackSettings,
      audioTrackSettings,
      mediaMode: 'preview' as const,
      renderScale: qualitySize.width / 1920,
      subtitles,
      audioPath: audioFile?.path || '',
      audioClips,
      subtitleSettings,
    }),
    [
      scenes,
      videoTracks,
      voiceTrackSettings,
      audioTrackSettings,
      qualitySize.width,
      subtitles,
      audioFile?.path,
      audioClips,
      subtitleSettings,
    ]
  )

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const updateFit = () => {
      const availableWidth = Math.max(240, viewport.clientWidth - 48)
      const availableHeight = Math.max(135, viewport.clientHeight - 64)
      setFitWidth(Math.min(availableWidth, availableHeight * (16 / 9)))
    }
    updateFit()
    const observer = new ResizeObserver(updateFit)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    localStorage.setItem('rhymx.previewQuality', quality)
  }, [quality])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    let lastClockUpdate = 0
    const syncFrame = () => {
      if (getScrubSnapshot().active) return
      lastClockUpdate = performance.now()
      setCurrentTimeSec(player.getCurrentFrame() / 30)
    }
    const onFrameUpdate = () => {
      const now = performance.now()
      if (now - lastClockUpdate < CLOCK_UPDATE_INTERVAL_MS) return
      syncFrame()
    }
    const onPlay = () => setIsPlaying(true)
    const onPause = () => {
      syncFrame()
      setIsPlaying(false)
    }
    const onEnded = () => {
      syncFrame()
      setIsPlaying(false)
    }

    syncFrame()
    setIsPlaying(player.isPlaying())
    player.addEventListener('frameupdate', onFrameUpdate)
    player.addEventListener('seeked', syncFrame)
    player.addEventListener('play', onPlay)
    player.addEventListener('pause', onPause)
    player.addEventListener('ended', onEnded)
    return () => {
      player.removeEventListener('frameupdate', onFrameUpdate)
      player.removeEventListener('seeked', syncFrame)
      player.removeEventListener('play', onPlay)
      player.removeEventListener('pause', onPause)
      player.removeEventListener('ended', onEnded)
    }
  }, [setCurrentTimeSec, setIsPlaying])

  useEffect(() => {
    const nextMedia = new Map(
      scenes.map((scene) => [scene.id, mediaSignature(scene)] as const)
    )
    const previousMedia = previousMediaRef.current
    previousMediaRef.current = nextMedia
    if (!previousMedia) return

    const player = playerRef.current
    if (!player) return
    const currentFrame = player.getCurrentFrame()
    const currentTime = currentFrame / 30
    const changedScene = scenes.find(
      (scene) =>
        previousMedia.get(scene.id) !== nextMedia.get(scene.id) &&
        currentTime >= scene.startTimeSec &&
        currentTime < scene.endTimeSec
    )
    if (!changedScene) return

    const refreshVersion = ++mediaRefreshVersionRef.current
    const wasPlaying = player.isPlaying()
    const startFrame = Math.round(changedScene.startTimeSec * 30)
    const endFrame = Math.max(startFrame, Math.round(changedScene.endTimeSec * 30) - 1)
    const warmFrame =
      currentFrame > startFrame
        ? Math.max(startFrame, currentFrame - 2)
        : Math.min(endFrame, currentFrame + 1)

    player.pause()
    setIsRefreshingMedia(true)
    player.seekTo(warmFrame)

    void (async () => {
      await nextPaint()
      if (refreshVersion !== mediaRefreshVersionRef.current) return
      player.seekTo(currentFrame)
      await waitForSceneMedia(player.getContainerNode(), changedScene)
      if (refreshVersion !== mediaRefreshVersionRef.current) return
      setIsRefreshingMedia(false)
      if (wasPlaying) player.play()
    })()
  }, [scenes])

  useEffect(
    () => () => {
      mediaRefreshVersionRef.current += 1
    },
    []
  )

  useEffect(() => {
    playerRef.current?.seekTo(Math.round(seekTargetSec * 30))
  }, [seekTargetSec, seekVersion])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    let scrubbing = false
    let latestFrame = 0
    let lastPreviewSeekAt = Number.NEGATIVE_INFINITY
    let previewTimer: ReturnType<typeof setTimeout> | null = null
    let resumePlayback = false
    let restoreMuted = false
    let disposed = false
    let scrubGeneration = 0

    const clearPreviewTimer = () => {
      if (previewTimer === null) return
      clearTimeout(previewTimer)
      previewTimer = null
    }

    const seekToLatestPreview = () => {
      previewTimer = null
      if (!scrubbing) return
      const elapsed = performance.now() - lastPreviewSeekAt
      if (elapsed < SCRUB_PREVIEW_INTERVAL_MS) {
        previewTimer = setTimeout(
          seekToLatestPreview,
          SCRUB_PREVIEW_INTERVAL_MS - elapsed
        )
        return
      }
      player.seekTo(latestFrame)
      lastPreviewSeekAt = performance.now()
    }

    const schedulePreviewSeek = () => {
      if (previewTimer !== null) return
      const elapsed = performance.now() - lastPreviewSeekAt
      if (elapsed >= SCRUB_PREVIEW_INTERVAL_MS) seekToLatestPreview()
      else {
        previewTimer = setTimeout(
          seekToLatestPreview,
          SCRUB_PREVIEW_INTERVAL_MS - elapsed
        )
      }
    }

    const onScrubChange = () => {
      const scrub = getScrubSnapshot()
      latestFrame = Math.round(scrub.timeSec * 30)

      if (scrub.active) {
        if (!scrubbing) {
          scrubbing = true
          scrubGeneration += 1
          resumePlayback = resumePlayback || player.isPlaying()
          restoreMuted = !player.isMuted()
          player.pause()
          if (restoreMuted) player.mute()
          lastPreviewSeekAt = Number.NEGATIVE_INFINITY
        }
        schedulePreviewSeek()
        return
      }

      if (!scrubbing) return
      scrubbing = false
      clearPreviewTimer()
      player.seekTo(latestFrame)
      if (restoreMuted) player.unmute()
      if (resumePlayback) {
        const resumeFrame = latestFrame
        const releaseGeneration = scrubGeneration
        void (async () => {
          const currentTime = resumeFrame / 30
          const activeScenes = scenesRef.current.filter(
            (scene) =>
              currentTime >= scene.startTimeSec && currentTime < scene.endTimeSec
          )
          await Promise.all(
            activeScenes
              .filter((scene) => scene.media && !scene.media.missing)
              .map((scene) =>
              waitForSceneMedia(player.getContainerNode(), scene, 1000)
              )
          )
          if (
            !disposed &&
            !getScrubSnapshot().active &&
            scrubGeneration === releaseGeneration &&
            player.getCurrentFrame() === resumeFrame
          ) {
            resumePlayback = false
            player.play()
          }
        })()
      }
    }

    const unsubscribe = subscribeToScrub(onScrubChange)
    onScrubChange()
    return () => {
      disposed = true
      unsubscribe()
      clearPreviewTimer()
      if (restoreMuted) player.unmute()
    }
  }, [])

  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    if (playbackCommand === 'play') player.play()
    else if (playbackCommand === 'pause') player.pause()
    else if (player.isPlaying()) player.pause()
    else player.play()
  }, [playbackCommand, playbackVersion])

  return (
    <div ref={viewportRef} className="w-full h-full overflow-auto custom-scrollbar relative">
      <div className="sticky top-0 right-0 z-30 flex justify-end pointer-events-none">
        <div className="pointer-events-auto rounded-lg border border-white/10 bg-[#14161d]/95 shadow-xl flex items-center gap-1 px-1.5 py-1">
          <select
            value={quality}
            onChange={(event) =>
              setQuality(event.target.value as 'low' | 'medium' | 'high' | 'ultra')
            }
            className="bg-transparent border-r border-white/10 pr-1 text-[10px] text-slate-400 outline-none capitalize"
            title="Preview canvas quality (source video decoding is unchanged)"
          >
            {(['low', 'medium', 'high', 'ultra'] as const).map((value) => (
              <option key={value} value={value} className="bg-[#14161d]">
                {value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              setZoom((value) => Math.max(25, (value === 'fit' ? 100 : value) - 25))
            }
            className="p-1 text-slate-500 hover:text-white"
            title="Zoom preview out"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <select
            value={String(zoom)}
            onChange={(event) =>
              setZoom(event.target.value === 'fit' ? 'fit' : Number(event.target.value))
            }
            className="bg-transparent text-[10px] text-slate-400 outline-none"
          >
            <option value="fit" className="bg-[#14161d]">
              Fit
            </option>
            {[25, 50, 75, 100, 125, 150, 200].map((value) => (
              <option key={value} value={value} className="bg-[#14161d]">
                {value}%
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              setZoom((value) => Math.min(200, (value === 'fit' ? 100 : value) + 25))
            }
            className="p-1 text-slate-500 hover:text-white"
            title="Zoom preview in"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-w-full min-h-full flex items-center justify-center py-8">
        <div
          className="relative aspect-video bg-black shadow-2xl shadow-black/60 rounded-xl overflow-hidden border border-white/10 shrink-0"
          style={{ width: fitWidth * (zoom === 'fit' ? 1 : zoom / 100) }}
        >
          <Player
            ref={playerRef}
            component={MainComposition}
            inputProps={inputProps}
            durationInFrames={durationInFrames}
            fps={30}
            compositionWidth={qualitySize.width}
            compositionHeight={qualitySize.height}
            style={{ width: '100%', height: '100%' }}
            className={`preview-quality-${quality}`}
            controls
          />
          {isRefreshingMedia && (
            <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center bg-black/20">
              <div className="rounded-lg border border-white/10 bg-[#101219]/90 px-3 py-2 flex items-center gap-2 text-[10px] text-slate-300 shadow-xl">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin text-violet-400" />
                Buffering replacement media…
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
