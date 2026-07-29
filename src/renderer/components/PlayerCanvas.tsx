import React, { useEffect, useMemo, useRef } from 'react'
import { Player, PlayerRef } from '@remotion/player'
import { MainComposition } from '../../remotion/Composition'
import { useEditorStore } from '../../store/useEditorStore'

export default function PlayerCanvas() {
  const {
    scenes,
    audioFile,
    audioClips,
    subtitleSettings,
    seekTargetSec,
    seekVersion,
    setCurrentTimeSec,
    setIsPlaying,
  } = useEditorStore()
  const playerRef = useRef<PlayerRef>(null)

  const totalDurationSec = useMemo(() => {
    const sceneEnd = scenes.reduce((max, scene) => Math.max(max, scene.endTimeSec), 0)
    const clipEnd = audioClips.reduce(
      (max, clip) => Math.max(max, clip.startTimeSec + clip.durationSec),
      0
    )
    return Math.max(audioFile?.duration || 0, sceneEnd, clipEnd, 10)
  }, [audioFile?.duration, scenes, audioClips])
  const durationInFrames = Math.max(1, Math.round(totalDurationSec * 30))

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

  return (
    <div className="w-full max-w-4xl aspect-video max-h-full bg-black shadow-2xl shadow-black/60 rounded-xl overflow-hidden border border-white/10">
      <Player
        ref={playerRef}
        component={MainComposition}
        inputProps={{
          scenes,
          audioPath: audioFile?.path || '',
          audioClips,
          subtitleSettings,
        }}
        durationInFrames={durationInFrames}
        fps={30}
        compositionWidth={1920}
        compositionHeight={1080}
        style={{ width: '100%', height: '100%' }}
        controls
      />
    </div>
  )
}
