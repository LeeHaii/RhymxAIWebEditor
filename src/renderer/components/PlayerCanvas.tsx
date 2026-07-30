import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Player, PlayerRef } from '@remotion/player'
import { MainComposition } from '../../remotion/Composition'
import { useEditorStore } from '../../store/useEditorStore'

const QUALITY_SIZES = {
  low: { width: 640, height: 360 },
  medium: { width: 1280, height: 720 },
  high: { width: 1920, height: 1080 },
  ultra: { width: 3840, height: 2160 },
} as const

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
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [fitWidth, setFitWidth] = useState(960)
  const [quality, setQuality] = useState<'low' | 'medium' | 'high' | 'ultra'>(
    () =>
      (localStorage.getItem('rhymx.previewQuality') as
        | 'low'
        | 'medium'
        | 'high'
        | 'ultra') || 'medium'
  )
  const qualitySize = QUALITY_SIZES[quality]

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
    const interval = window.setInterval(() => {
      if (playerRef.current) {
        setCurrentTimeSec(playerRef.current.getCurrentFrame() / 30)
        setIsPlaying(playerRef.current.isPlaying())
      }
    }, 100)
    return () => window.clearInterval(interval)
  }, [setCurrentTimeSec, setIsPlaying])

  useEffect(() => {
    playerRef.current?.seekTo(Math.round(seekTargetSec * 30))
  }, [seekTargetSec, seekVersion])

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
            title="Preview render quality"
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
          className="aspect-video bg-black shadow-2xl shadow-black/60 rounded-xl overflow-hidden border border-white/10 shrink-0"
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
        </div>
      </div>
    </div>
  )
}
