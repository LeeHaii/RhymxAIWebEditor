import React from 'react'
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  Video,
} from 'remotion'
import { SceneSegment, SubtitleSettings, TimelineAudioClip } from '../types/editor'

const defaultSubtitleSettings: SubtitleSettings = {
  enabled: true,
  fontSize: 48,
  textColor: '#ffffff',
  backgroundColor: '#000000',
  position: 'bottom',
}

function mediaSource(source: string) {
  if (!source || /^(https?:|data:|blob:|file:)/.test(source)) return source
  return encodeURI(`file:///${source.replace(/\\/g, '/')}`)
}

export const MainComposition: React.FC<{
  scenes: SceneSegment[]
  audioPath: string
  audioClips?: TimelineAudioClip[]
  subtitleSettings?: SubtitleSettings
}> = ({
  scenes,
  audioPath,
  audioClips = [],
  subtitleSettings = defaultSubtitleSettings,
}) => {
  const { fps } = useVideoConfig()

  return (
    <AbsoluteFill style={{ backgroundColor: '#07080b' }}>
      {audioPath && <Audio src={mediaSource(audioPath)} />}

      {audioClips.map((clip) => (
        <Sequence
          key={clip.id}
          from={Math.round(clip.startTimeSec * fps)}
          durationInFrames={Math.max(1, Math.round(clip.durationSec * fps))}
        >
          <Audio src={mediaSource(clip.path)} volume={clip.volume} />
        </Sequence>
      ))}

      {scenes.map((scene) => (
        <Sequence
          key={scene.id}
          from={Math.round(scene.startTimeSec * fps)}
          durationInFrames={Math.max(1, Math.round(scene.durationSec * fps))}
        >
          <SceneContent scene={scene} subtitleSettings={subtitleSettings} />
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}

const SceneContent: React.FC<{
  scene: SceneSegment
  subtitleSettings: SubtitleSettings
}> = ({ scene, subtitleSettings }) => {
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const media = scene.media

  let transform = 'none'
  if (
    media &&
    (media.type === 'google_image' || media.type === 'local_image') &&
    media.enableKenBurnsEffect
  ) {
    const durationFrames = Math.round(scene.durationSec * fps)
    const scale = interpolate(frame, [0, durationFrames], [1, 1.12], {
      extrapolateRight: 'clamp',
    })
    transform = `scale(${scale})`
  }

  const isVideo =
    media?.type === 'pexels_video' ||
    media?.type === 'youtube_clip' ||
    media?.type === 'local_video'

  return (
    <AbsoluteFill>
      {!media ? (
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
      ) : isVideo ? (
        <Video
          src={mediaSource(media.sourceUrl)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
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

      {subtitleSettings.enabled && scene.transcriptText && (
        <AbsoluteFill
          style={{
            justifyContent: subtitleSettings.position === 'center' ? 'center' : 'flex-end',
            paddingBottom: subtitleSettings.position === 'bottom' ? 72 : 0,
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <p
            style={{
              color: subtitleSettings.textColor,
              fontSize: subtitleSettings.fontSize,
              lineHeight: 1.25,
              fontWeight: 650,
              textAlign: 'center',
              backgroundColor: `${subtitleSettings.backgroundColor}cc`,
              margin: '0 110px',
              padding: '12px 24px',
              borderRadius: 12,
              textShadow: '0 2px 8px rgba(0,0,0,.55)',
            }}
          >
            {scene.transcriptText}
          </p>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}
