import React, { PointerEvent, useMemo, useRef } from 'react'
import { Captions, Mic2, Music2, Scissors, Trash2 } from 'lucide-react'
import { SceneSegment } from '../../../types/editor'
import { useEditorStore } from '../../../store/useEditorStore'

const labelWidth = 72

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const remaining = Math.floor(safe % 60)
  return `${minutes}:${remaining.toString().padStart(2, '0')}`
}

export default function Timeline() {
  const {
    scenes,
    audioClips,
    activeSceneId,
    setActiveSceneId,
    audioFile,
    currentTimeSec,
    requestSeek,
    splitScene,
    trimScene,
    deleteScene,
    removeAudioClip,
  } = useEditorStore()
  const trackRef = useRef<HTMLDivElement>(null)

  const totalDuration = useMemo(() => {
    const sceneEnd = scenes.reduce((max, scene) => Math.max(max, scene.endTimeSec), 0)
    const audioEnd = audioClips.reduce(
      (max, clip) => Math.max(max, clip.startTimeSec + clip.durationSec),
      0
    )
    return Math.max(audioFile?.duration || 0, sceneEnd, audioEnd, 10)
  }, [audioFile?.duration, scenes, audioClips])

  const left = (seconds: number) => `${(seconds / totalDuration) * 100}%`
  const width = (seconds: number) => `${Math.max(0.15, (seconds / totalDuration) * 100)}%`

  const seekFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rectangle = trackRef.current?.getBoundingClientRect()
    if (!rectangle) return
    const ratio = Math.max(0, Math.min(1, (event.clientX - rectangle.left) / rectangle.width))
    requestSeek(ratio * totalDuration)
  }

  const startTrim = (
    event: PointerEvent<HTMLDivElement>,
    scene: SceneSegment,
    edge: 'start' | 'end'
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const rectangle = trackRef.current?.getBoundingClientRect()
    if (!rectangle) return
    const pointerStart = event.clientX
    const originalStart = scene.startTimeSec
    const originalEnd = scene.endTimeSec

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = ((moveEvent.clientX - pointerStart) / rectangle.width) * totalDuration
      if (edge === 'start') {
        const nextStart = Math.max(0, Math.min(originalEnd - 0.2, originalStart + delta))
        trimScene(scene.id, nextStart, originalEnd)
      } else {
        const nextEnd = Math.max(originalStart + 0.2, Math.min(totalDuration, originalEnd + delta))
        trimScene(scene.id, originalStart, nextEnd)
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const activeScene = scenes.find((scene) => scene.id === activeSceneId)
  const canSplit =
    Boolean(activeScene) &&
    currentTimeSec > (activeScene?.startTimeSec || 0) + 0.2 &&
    currentTimeSec < (activeScene?.endTimeSec || 0) - 0.2

  return (
    <div className="w-full h-full flex flex-col select-none">
      <div className="h-11 shrink-0 border-b border-white/5 flex items-center justify-between px-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => activeSceneId && splitScene(activeSceneId, currentTimeSec)}
            disabled={!canSplit}
            className="h-8 px-3 rounded-lg hover:bg-white/5 disabled:text-slate-700 text-slate-400 flex items-center gap-2 text-xs transition-colors"
            title="Split selected scene at playhead"
          >
            <Scissors className="h-3.5 w-3.5" />
            Split
          </button>
          <button
            onClick={() => activeSceneId && deleteScene(activeSceneId)}
            disabled={!activeSceneId}
            className="h-8 px-3 rounded-lg hover:bg-red-500/10 hover:text-red-400 disabled:text-slate-700 text-slate-400 flex items-center gap-2 text-xs transition-colors"
            title="Delete selected scene"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
        <div className="text-[11px] text-slate-500 font-mono">
          {formatTime(currentTimeSec)} / {formatTime(totalDuration)}
          {activeScene && <span className="ml-3 text-violet-400/80">Drag clip edges to trim</span>}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex">
        <div className="w-[72px] shrink-0 pt-7 bg-[#0d0f14] border-r border-white/5 text-[10px] text-slate-600">
          <div className="h-9 flex items-center px-3 gap-2">
            <Mic2 className="h-3 w-3 text-violet-400" /> Voice
          </div>
          <div className="h-[62px] flex items-center px-3">Video</div>
          <div className="h-10 flex items-center px-3 gap-2">
            <Captions className="h-3 w-3 text-sky-400" /> Text
          </div>
          <div className="h-10 flex items-center px-3 gap-2">
            <Music2 className="h-3 w-3 text-emerald-400" /> Audio
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-x-hidden">
          <div className="h-7 relative border-b border-white/5 bg-[#0d0f14]">
            {Array.from({ length: 11 }, (_, index) => {
              const time = (totalDuration / 10) * index
              return (
                <div
                  key={index}
                  className="absolute top-0 bottom-0 border-l border-white/5 text-[9px] text-slate-600 pl-1 pt-1"
                  style={{ left: `${index * 10}%` }}
                >
                  {formatTime(time)}
                </div>
              )
            })}
          </div>

          <div
            ref={trackRef}
            onPointerDown={seekFromPointer}
            className="relative h-[181px] bg-[#0c0e13] cursor-text"
          >
            {Array.from({ length: 11 }, (_, index) => (
              <div
                key={index}
                className="absolute top-0 bottom-0 border-l border-white/[0.035]"
                style={{ left: `${index * 10}%` }}
              />
            ))}

            <div
              className="absolute top-0 bottom-0 w-px bg-rose-500 z-50 pointer-events-none"
              style={{ left: left(currentTimeSec) }}
            >
              <div className="absolute -top-1 -left-[4px] h-2.5 w-2.5 rotate-45 bg-rose-500 rounded-sm" />
            </div>

            <div className="absolute top-0 left-0 right-0 h-9 border-b border-white/5 p-1">
              {audioFile && (
                <div className="h-full rounded-md bg-violet-600/20 border border-violet-500/25 px-2 flex items-center text-[10px] text-violet-300 overflow-hidden">
                  <span className="truncate">
                    {audioFile.path.split(/[\\/]/).pop()} · waveform
                  </span>
                  <div className="ml-auto flex items-end gap-px h-4 opacity-40">
                    {[8, 13, 6, 16, 10, 14, 7, 12, 16, 9, 5, 13].map((height, index) => (
                      <span key={index} className="w-px bg-violet-300" style={{ height }} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="absolute top-9 left-0 right-0 h-[62px] border-b border-white/5">
              {scenes.map((scene, index) => {
                const selected = activeSceneId === scene.id
                return (
                  <div
                    key={scene.id}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      setActiveSceneId(scene.id)
                      requestSeek(scene.startTimeSec)
                    }}
                    className={`absolute top-1 bottom-1 rounded-md border cursor-pointer overflow-hidden transition-colors ${
                      selected
                        ? 'border-violet-400 bg-violet-600/35 z-20'
                        : 'border-white/10 bg-slate-700/35 hover:bg-slate-700/55'
                    }`}
                    style={{ left: left(scene.startTimeSec), width: width(scene.durationSec) }}
                  >
                    {selected && (
                      <>
                        <div
                          onPointerDown={(event) => startTrim(event, scene, 'start')}
                          className="absolute left-0 top-0 bottom-0 w-2 bg-violet-300 cursor-ew-resize z-30"
                        />
                        <div
                          onPointerDown={(event) => startTrim(event, scene, 'end')}
                          className="absolute right-0 top-0 bottom-0 w-2 bg-violet-300 cursor-ew-resize z-30"
                        />
                      </>
                    )}
                    <div className="h-4 px-2 bg-black/20 flex items-center text-[9px] text-slate-400">
                      {index + 1}
                      {scene.media && <span className="ml-1 text-emerald-400">• media</span>}
                    </div>
                    <div className="px-2 py-1 text-[10px] text-slate-200 truncate">
                      {scene.transcriptText || 'Empty scene'}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="absolute top-[101px] left-0 right-0 h-10 border-b border-white/5">
              {scenes.map((scene) => (
                <div
                  key={`subtitle-${scene.id}`}
                  className="absolute top-1 bottom-1 rounded bg-sky-500/15 border border-sky-500/20 px-2 flex items-center text-[9px] text-sky-200/80 truncate"
                  style={{ left: left(scene.startTimeSec), width: width(scene.durationSec) }}
                >
                  {scene.transcriptText}
                </div>
              ))}
            </div>

            <div className="absolute top-[141px] left-0 right-0 h-10">
              {audioClips.map((clip) => (
                <div
                  key={clip.id}
                  className="group absolute top-1 bottom-1 rounded bg-emerald-500/15 border border-emerald-500/25 px-2 flex items-center text-[9px] text-emerald-200 truncate"
                  style={{ left: left(clip.startTimeSec), width: width(clip.durationSec) }}
                >
                  {clip.name}
                  <button
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => removeAudioClip(clip.id)}
                    className="ml-auto opacity-0 group-hover:opacity-100 hover:text-red-300"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
