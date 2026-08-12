import React, { useMemo } from 'react'
import {
  AbsoluteFill,
  Html5Video,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { Audio, Video as ExportVideo } from '@remotion/media'
import { hasResolvedMediaSource, resolveMediaUrl } from '../platform/web/browserAssets'
import {
  SceneSegment,
  SubtitleSegment,
  SubtitleSettings,
  TimelineAudioClip,
  TrackSettings,
  VideoTrack,
} from '../types/editor'

const defaultSubtitleSettings: SubtitleSettings = {
  enabled: true,
  fontSize: 48,
  fontFamily: 'Inter, Arial, sans-serif',
  fontWeight: 650,
  textColor: '#ffffff',
  backgroundEnabled: true,
  backgroundColor: '#000000',
  backgroundOpacity: 0.8,
  outlineEnabled: false,
  outlineColor: '#000000',
  outlineWidth: 3,
  position: 'bottom',
  mode: 'sentence',
  activeWordColor: '#c4b5fd',
  maximumCharactersPerLine: 42,
  minimumDisplayDurationSec: 0.7,
  maximumDisplayDurationSec: 6,
}

const defaultTrackSettings: TrackSettings = { muted: false, visible: true }

export type CompositionMediaMode = 'preview' | 'export'

function mediaSource(source: string) {
  return resolveMediaUrl(source)
}

export const MainComposition: React.FC<{
  scenes: SceneSegment[]
  subtitles?: SubtitleSegment[]
  audioPath: string
  audioClips?: TimelineAudioClip[]
  subtitleSettings?: SubtitleSettings
  videoTracks?: VideoTrack[]
  voiceTrackSettings?: TrackSettings
  audioTrackSettings?: TrackSettings
  renderScale?: number
  mediaMode?: CompositionMediaMode
}> = ({
  scenes,
  subtitles = [],
  audioPath,
  audioClips = [],
  subtitleSettings = defaultSubtitleSettings,
  videoTracks = [],
  voiceTrackSettings = defaultTrackSettings,
  audioTrackSettings = defaultTrackSettings,
  renderScale = 1,
  mediaMode = 'export',
}) => {
  const { fps } = useVideoConfig()
  const orderedScenes = useMemo(
    () =>
      [...scenes].sort((first, second) => {
        const firstTrack = videoTracks.findIndex((track) => track.id === first.trackId)
        const secondTrack = videoTracks.findIndex((track) => track.id === second.trackId)
        const trackDifference =
          (firstTrack < 0 ? 0 : firstTrack) - (secondTrack < 0 ? 0 : secondTrack)
        return trackDifference || first.startTimeSec - second.startTimeSec
      }),
    [scenes, videoTracks]
  )

  return (
    <AbsoluteFill style={{ backgroundColor: '#07080b' }}>
      {audioPath && voiceTrackSettings.visible && !voiceTrackSettings.muted && (
        <Audio src={mediaSource(audioPath)} />
      )}

      {audioTrackSettings.visible &&
        !audioTrackSettings.muted &&
        audioClips.map((clip) => (
          <Sequence
            key={clip.id}
            from={Math.round(clip.startTimeSec * fps)}
            durationInFrames={Math.max(1, Math.round(clip.durationSec * fps))}
            premountFor={Math.round(fps / 2)}
            postmountFor={Math.round(fps / 4)}
          >
            <Audio
              src={mediaSource(clip.path)}
              volume={clip.volume}
              trimBefore={Math.round((clip.sourceStartSec ?? 0) * fps)}
            />
          </Sequence>
        ))}

      {orderedScenes.map((scene) => {
        const track = videoTracks.find((item) => item.id === scene.trackId)
        if (track && !track.visible) return null
        const isPreview = mediaMode === 'preview'
        return (
          <Sequence
            key={scene.id}
            from={Math.round(scene.startTimeSec * fps)}
            durationInFrames={Math.max(1, Math.round(scene.durationSec * fps))}
            premountFor={isPreview ? Math.round(fps / 4) : fps}
            postmountFor={isPreview ? 0 : Math.round(fps / 2)}
          >
            <SceneContent
              key={`${scene.media?.sourceUrl || 'empty'}:${scene.media?.sourceStartSec || 0}`}
              scene={scene}
              trackMuted={track?.muted || false}
              mediaMode={mediaMode}
            />
          </Sequence>
        )
      })}

      {subtitleSettings.enabled &&
        subtitles.map((subtitle) => (
          <Sequence
            key={subtitle.id}
            from={Math.round(subtitle.startTimeSec * fps)}
            durationInFrames={Math.max(
              1,
              Math.round((subtitle.endTimeSec - subtitle.startTimeSec) * fps)
            )}
          >
            <SubtitleContent
              subtitle={subtitle}
              settings={subtitleSettings}
              renderScale={renderScale}
            />
          </Sequence>
        ))}
    </AbsoluteFill>
  )
}

const SceneContent: React.FC<{
  scene: SceneSegment
  trackMuted: boolean
  mediaMode: CompositionMediaMode
}> = React.memo(({ scene, trackMuted, mediaMode }) => {
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const media = scene.media

  let transform = 'none'
  if (
    media &&
    (media.type === 'remote_image' || media.type === 'local_image') &&
    media.enableKenBurnsEffect
  ) {
    const durationFrames = Math.round(scene.durationSec * fps)
    const scale = interpolate(frame, [0, durationFrames], [1, 1.12], {
      extrapolateRight: 'clamp',
    })
    transform = `scale(${scale})`
  }

  const isVideo =
    media?.type === 'remote_video' || media?.type === 'local_video'
  const renderedMotionSource =
    media?.type === 'motion_graphic' &&
    media.motion?.engine === 'hyperframes' &&
    media.motion.renderedAssetPath &&
    hasResolvedMediaSource(media.motion.renderedAssetPath)
      ? media.motion.renderedAssetPath
      : undefined
  const videoSource =
    mediaMode === 'preview' && media?.previewSourceUrl
      ? media.previewSourceUrl
      : media?.sourceUrl

  return (
    <AbsoluteFill
      data-rhymx-scene-id={scene.id}
      style={{
        opacity: scene.opacity ?? 1,
        transform: `scale(${scene.scale ?? 1})`,
        transformOrigin: 'center center',
      }}
    >
      {media?.missing ? (
        <AbsoluteFill
          style={{
            background: 'radial-gradient(circle at 50% 35%, #301b22 0%, #090a0e 68%)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 48,
            textAlign: 'center',
          }}
        >
          <div style={{ color: '#fca5a5', fontSize: 30, fontWeight: 650 }}>
            YouTube clip file is missing
          </div>
          <div style={{ color: '#8f6670', fontSize: 18, marginTop: 12 }}>
            Download this clip again from the YouTube search tab
          </div>
        </AbsoluteFill>
      ) : !media ? (
        <AbsoluteFill
          style={{
            background: 'radial-gradient(circle at 50% 30%, #20243a 0%, #090a0e 62%)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              color: '#737b94',
              fontSize: 32,
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Add media to this scene
          </div>
        </AbsoluteFill>
      ) : renderedMotionSource ? (
        mediaMode === 'preview' ? (
          <Html5Video
            src={mediaSource(renderedMotionSource)}
            volume={0}
            preload="auto"
            pauseWhenBuffering
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <ExportVideo
            src={mediaSource(renderedMotionSource)}
            volume={0}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )
      ) : media.type === 'motion_graphic' && media.motion ? (
        <MotionGraphicContent scene={scene} />
      ) : isVideo ? (
        mediaMode === 'preview' ? (
          <Html5Video
            src={mediaSource(videoSource || media.sourceUrl)}
            volume={trackMuted ? 0 : (scene.volume ?? 1)}
            trimBefore={Math.round((media.sourceStartSec ?? 0) * fps)}
            preload="auto"
            pauseWhenBuffering
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <ExportVideo
            src={mediaSource(media.sourceUrl)}
            volume={trackMuted ? 0 : (scene.volume ?? 1)}
            trimBefore={Math.round((media.sourceStartSec ?? 0) * fps)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )
      ) : (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
          <Img
            src={mediaSource(media.sourceUrl)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: media.imageFit === 'contain' ? 'contain' : 'cover',
              transform,
            }}
          />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
})

const SubtitleContent: React.FC<{
  subtitle: SubtitleSegment
  settings: SubtitleSettings
  renderScale: number
}> = ({ subtitle, settings, renderScale }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const currentTimeSec = subtitle.startTimeSec + frame / fps
  const words = subtitle.words || []
  const activeIndex = words.findIndex(
    (word) =>
      currentTimeSec >= word.startTimeSec && currentTimeSec < word.endTimeSec
  )
  const phraseStart = activeIndex < 0 ? 0 : Math.floor(activeIndex / 3) * 3
  const phrase = words.slice(phraseStart, phraseStart + 3)
  const visibleWords =
    settings.mode === 'word'
      ? activeIndex >= 0
        ? [words[activeIndex]]
        : words.slice(0, 1)
      : settings.mode === 'phrase'
        ? phrase
        : words
  const fallbackText = subtitle.text

  return (
  <AbsoluteFill
    style={{
      justifyContent: settings.position === 'center' ? 'center' : 'flex-end',
      paddingBottom: settings.position === 'bottom' ? 72 * renderScale : 0,
      alignItems: 'center',
      pointerEvents: 'none',
    }}
  >
    <p
      style={{
        color: settings.textColor,
        fontSize: settings.fontSize * renderScale,
        fontFamily: settings.fontFamily,
        lineHeight: 1.25,
        fontWeight: settings.fontWeight,
        textAlign: 'center',
        whiteSpace: 'pre-line',
        backgroundColor: settings.backgroundEnabled
          ? colorWithOpacity(settings.backgroundColor, settings.backgroundOpacity)
          : 'transparent',
        margin: `0 ${110 * renderScale}px`,
        padding: `${12 * renderScale}px ${24 * renderScale}px`,
        borderRadius: 12 * renderScale,
        textShadow: `0 ${2 * renderScale}px ${8 * renderScale}px rgba(0,0,0,.55)`,
        WebkitTextStroke: settings.outlineEnabled
          ? `${settings.outlineWidth * renderScale}px ${settings.outlineColor}`
          : undefined,
        paintOrder: 'stroke fill',
      }}
    >
      {visibleWords.length > 0 && settings.mode !== 'sentence'
        ? visibleWords.map((word, index) => {
            const absoluteIndex =
              settings.mode === 'phrase' ? phraseStart + index :
              settings.mode === 'word' ? activeIndex : index
            const active = absoluteIndex === activeIndex
            const completed = absoluteIndex < activeIndex
            const emphasized =
              settings.mode === 'keywords' && word.text.replace(/\W/g, '').length >= 7
            return (
              <React.Fragment key={word.id}>
                <span
                  style={{
                    color:
                      active || emphasized || (settings.mode === 'karaoke' && completed)
                        ? settings.activeWordColor
                        : settings.textColor,
                    fontWeight: active || emphasized ? 850 : settings.fontWeight,
                    opacity:
                      settings.mode === 'active-word' && !active ? 0.58 : 1,
                  }}
                >
                  {word.text}
                </span>{' '}
              </React.Fragment>
            )
          })
        : fallbackText}
    </p>
  </AbsoluteFill>
  )
}

const MotionGraphicContent: React.FC<{ scene: SceneSegment }> = ({ scene }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const motion = scene.media?.motion
  if (!motion) return null
  const values = motion.values
  const progress = Math.min(1, frame / Math.max(1, fps * 0.8))
  const exit = Math.min(
    1,
    Math.max(0, (frame - scene.durationSec * fps + fps * 0.55) / (fps * 0.55))
  )
  const eased = 1 - Math.pow(1 - progress, 3)
  const accent = motion.accentColor || String(values.accent || '#8b5cf6')
  const title = String(values.title || values.label || 'Make the idea move')
  const body = String(values.body || values.value || 'Rhymx')
  const isAdvanced = motion.engine === 'hyperframes'
  const background = isAdvanced
    ? `radial-gradient(circle at ${20 + progress * 50}% 30%, ${accent}66 0%, transparent 34%), linear-gradient(135deg, #070811, #151126 55%, #08090d)`
    : `linear-gradient(135deg, #0a0b10, ${accent}33 54%, #090a0e)`

  if (motion.templateId === 'progress_bar') {
    const target = Math.max(0, Math.min(100, Number(values.value || 72)))
    return (
      <AbsoluteFill style={{ background, justifyContent: 'center', padding: 140 }}>
        <div style={{ color: '#a6adbd', fontSize: 30, marginBottom: 30 }}>{title}</div>
        <div style={{ height: 32, borderRadius: 99, background: '#ffffff14', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${target * eased}%`, background: accent, borderRadius: 99 }} />
        </div>
        <div style={{ color: 'white', fontSize: 86, fontWeight: 800, marginTop: 28 }}>
          {Math.round(target * eased)}%
        </div>
      </AbsoluteFill>
    )
  }

  if (motion.templateId === 'quote') {
    return (
      <AbsoluteFill style={{ background, justifyContent: 'center', padding: '11%' }}>
        <div style={{ color: accent, fontSize: 90, lineHeight: 0.5 }}>“</div>
        <div style={{ color: 'white', fontSize: 62, lineHeight: 1.18, fontWeight: 650, maxWidth: 1450 }}>
          {title}
        </div>
        <div style={{ color: '#b5bbc9', fontSize: 28, marginTop: 36 }}>{body}</div>
      </AbsoluteFill>
    )
  }

  return (
    <AbsoluteFill
      style={{
        background,
        justifyContent: 'center',
        alignItems: isAdvanced ? 'flex-start' : 'center',
        padding: '10%',
        overflow: 'hidden',
      }}
    >
      {isAdvanced && (
        <div
          style={{
            position: 'absolute',
            width: 760,
            height: 760,
            right: -120 + frame * 1.6,
            top: -220,
            border: `1px solid ${accent}88`,
            borderRadius: '46% 54% 61% 39%',
            transform: `rotate(${frame * 0.45}deg)`,
          }}
        />
      )}
      <div
        style={{
          color: accent,
          fontSize: 22,
          fontWeight: 750,
          letterSpacing: 6,
          textTransform: 'uppercase',
          opacity: eased,
        }}
      >
        {motion.engine === 'hyperframes' ? 'Fallback preview · HyperFrames offline' : 'Integrated motion'}
      </div>
      <div
        style={{
          color: 'white',
          fontSize: isAdvanced ? 106 : 88,
          lineHeight: 0.98,
          fontWeight: 850,
          maxWidth: 1500,
          textAlign: isAdvanced ? 'left' : 'center',
          marginTop: 28,
          transform: `translateY(${(1 - eased) * 90 - exit * 40}px) scale(${0.92 + eased * 0.08})`,
          opacity: 1 - exit,
        }}
      >
        {title}
      </div>
      <div style={{ color: '#b6bdca', fontSize: 34, marginTop: 30, opacity: eased * (1 - exit) }}>
        {body}
      </div>
    </AbsoluteFill>
  )
}

function colorWithOpacity(color: string, opacity: number) {
  const normalized = color.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return color
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, opacity))})`
}
