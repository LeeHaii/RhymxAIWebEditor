import { create } from 'zustand'
import {
  AppScreen,
  LibraryAsset,
  MediaAsset,
  ProjectDocument,
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
}

const defaultTrackSettings = (): TrackSettings => ({ muted: false, visible: true })

const defaultVideoTracks = (): VideoTrack[] => [
  { id: 'track_main', name: 'Main video', muted: false, visible: true },
]

const normalizeVideoTracks = (tracks?: VideoTrack[]): VideoTrack[] =>
  (tracks?.length ? tracks : defaultVideoTracks()).map((track) => ({
    ...track,
    muted: track.muted ?? false,
    visible: track.visible ?? true,
  }))

const normalizeSubtitleSettings = (settings?: SubtitleSettings): SubtitleSettings => ({
  ...defaultSubtitleSettings,
  ...(settings || {}),
})

const normalizeScenes = (scenes: SceneSegment[], fallbackTrackId: string): SceneSegment[] =>
  scenes.map((scene) => {
    const media = scene.media
      ? {
          ...scene.media,
          sourceStartSec: scene.media.sourceStartSec ?? 0,
          sourceDurationSec: scene.media.sourceDurationSec ?? scene.media.durationSec,
        }
      : null
    const isImage =
      media?.type === 'local_image' ||
      media?.type === 'google_image' ||
      media?.type === 'duckduckgo_image'
    const maximumDuration =
      media && !isImage && media.sourceDurationSec
        ? Math.max(1 / 30, media.sourceDurationSec - (media.sourceStartSec ?? 0))
        : Number.POSITIVE_INFINITY
    const durationSec = Math.min(scene.durationSec, maximumDuration)
    return {
      ...scene,
      media,
      durationSec,
      endTimeSec: scene.startTimeSec + durationSec,
      trackId: scene.trackId || fallbackTrackId,
      volume: scene.volume ?? 1,
      scale: scene.scale ?? 1,
      opacity: scene.opacity ?? 1,
    }
  })

const normalizeAudioClips = (clips?: TimelineAudioClip[]): TimelineAudioClip[] =>
  (clips || []).map((clip) => {
    const sourceStartSec = clip.sourceStartSec ?? 0
    return {
      ...clip,
      sourceStartSec,
      durationSec: clip.sourceDurationSec
        ? Math.min(
            clip.durationSec,
            Math.max(1 / 30, clip.sourceDurationSec - sourceStartSec)
          )
        : clip.durationSec,
    }
  })

interface HistorySnapshot {
  audioFile: { path: string; duration: number } | null
  scenes: SceneSegment[]
  videoTracks: VideoTrack[]
  voiceTrackSettings: TrackSettings
  audioTrackSettings: TrackSettings
  subtitles: SubtitleSegment[]
  mediaLibrary: LibraryAsset[]
  audioClips: TimelineAudioClip[]
  subtitleSettings: SubtitleSettings
}

interface EditorStore {
  screen: AppScreen
  projectId: string | null
  projectName: string
  projectCreatedAt: string | null
  projectUpdatedAt: string | null
  audioFile: { path: string; duration: number } | null
  scenes: SceneSegment[]
  videoTracks: VideoTrack[]
  voiceTrackSettings: TrackSettings
  audioTrackSettings: TrackSettings
  subtitles: SubtitleSegment[]
  mediaLibrary: LibraryAsset[]
  audioClips: TimelineAudioClip[]
  subtitleSettings: SubtitleSettings
  activeSceneId: string | null
  activeAudioClipId: string | null
  activeSubtitleId: string | null
  currentTimeSec: number
  isPlaying: boolean
  apiKeys: {
    gemini: string
    pexels: string
    youtube: string
  }
  isProcessingAudio: boolean
  processingError: string | null
  exportProgress: number | null
  seekTargetSec: number
  seekVersion: number
  playbackCommand: 'play' | 'pause' | 'toggle'
  playbackVersion: number
  history: HistorySnapshot[]
  future: HistorySnapshot[]

  setScreen: (screen: AppScreen) => void
  beginProject: (name: string, audioFile: { path: string; duration: number }) => void
  loadProject: (project: ProjectDocument) => void
  closeProject: () => void
  setProjectName: (name: string) => void
  setAudioFile: (file: { path: string; duration: number } | null) => void
  setScenes: (scenes: SceneSegment[]) => void
  updateScene: (id: string, updates: Partial<SceneSegment>) => void
  splitScene: (id: string, atTimeSec: number) => void
  trimScene: (
    id: string,
    startTimeSec: number,
    endTimeSec: number,
    sourceStartSec?: number
  ) => void
  deleteScene: (id: string) => void
  addVideoTrack: () => void
  removeVideoTrack: (id: string) => void
  updateVideoTrack: (id: string, updates: Partial<VideoTrack>) => void
  updateVoiceTrackSettings: (updates: Partial<TrackSettings>) => void
  updateAudioTrackSettings: (updates: Partial<TrackSettings>) => void
  addSceneFromAsset: (asset: LibraryAsset, trackId: string, startTimeSec: number) => void
  moveScene: (id: string, startTimeSec: number, trackId: string) => void
  setActiveSceneId: (id: string | null) => void
  setActiveAudioClipId: (id: string | null) => void
  setActiveSubtitleId: (id: string | null) => void
  updateSubtitle: (id: string, text: string) => void
  splitSubtitle: (id: string, characterIndex: number) => void
  setCurrentTimeSec: (time: number) => void
  requestSeek: (time: number) => void
  requestPlayback: (command?: 'play' | 'pause' | 'toggle') => void
  setIsPlaying: (playing: boolean) => void
  setApiKeys: (keys: {
    gemini?: string
    pexels?: string
    youtube?: string
  }) => void
  setIsProcessingAudio: (processing: boolean) => void
  setProcessingError: (error: string | null) => void
  setExportProgress: (progress: number | null) => void
  addMediaAssets: (assets: LibraryAsset[]) => void
  removeMediaAsset: (id: string) => void
  assignMediaToScene: (sceneId: string, media: MediaAsset) => void
  addAudioClip: (asset: LibraryAsset, startTimeSec?: number) => void
  removeAudioClip: (id: string) => void
  moveAudioClip: (id: string, startTimeSec: number) => void
  updateAudioClip: (id: string, updates: Partial<TimelineAudioClip>) => void
  trimAudioClip: (
    id: string,
    startTimeSec: number,
    durationSec: number,
    sourceStartSec: number
  ) => void
  updateSubtitleSettings: (updates: Partial<SubtitleSettings>) => void
  checkpointHistory: () => void
  undo: () => void
  redo: () => void
}

const markUpdated = () => new Date().toISOString()

const subtitlesFromScenes = (scenes: SceneSegment[]): SubtitleSegment[] =>
  scenes.map((scene, index) => ({
    id: `subtitle_${index + 1}_${scene.id}`,
    startTimeSec: scene.startTimeSec,
    endTimeSec: scene.endTimeSec,
    text: scene.transcriptText,
  }))

const capture = (state: EditorStore): HistorySnapshot => ({
  audioFile: state.audioFile,
  scenes: state.scenes,
  videoTracks: state.videoTracks,
  voiceTrackSettings: state.voiceTrackSettings,
  audioTrackSettings: state.audioTrackSettings,
  subtitles: state.subtitles,
  mediaLibrary: state.mediaLibrary,
  audioClips: state.audioClips,
  subtitleSettings: state.subtitleSettings,
})

const historyChange = (state: EditorStore, changes: Partial<EditorStore>) => ({
  ...changes,
  history: [...state.history.slice(-49), capture(state)],
  future: [],
  projectUpdatedAt: markUpdated(),
})

const restoredSelection = (state: EditorStore, snapshot: HistorySnapshot) => ({
  activeSceneId: snapshot.scenes.some((scene) => scene.id === state.activeSceneId)
    ? state.activeSceneId
    : snapshot.scenes[0]?.id || null,
  activeAudioClipId: snapshot.audioClips.some((clip) => clip.id === state.activeAudioClipId)
    ? state.activeAudioClipId
    : null,
  activeSubtitleId: snapshot.subtitles.some((subtitle) => subtitle.id === state.activeSubtitleId)
    ? state.activeSubtitleId
    : snapshot.subtitles[0]?.id || null,
})

export const useEditorStore = create<EditorStore>((set) => ({
  screen: 'projects',
  projectId: null,
  projectName: '',
  projectCreatedAt: null,
  projectUpdatedAt: null,
  audioFile: null,
  scenes: [],
  videoTracks: defaultVideoTracks(),
  voiceTrackSettings: defaultTrackSettings(),
  audioTrackSettings: defaultTrackSettings(),
  subtitles: [],
  mediaLibrary: [],
  audioClips: [],
  subtitleSettings: defaultSubtitleSettings,
  activeSceneId: null,
  activeAudioClipId: null,
  activeSubtitleId: null,
  currentTimeSec: 0,
  isPlaying: false,
  apiKeys: {
    gemini: '',
    pexels: '',
    youtube: '',
  },
  isProcessingAudio: false,
  processingError: null,
  exportProgress: null,
  seekTargetSec: 0,
  seekVersion: 0,
  playbackCommand: 'pause',
  playbackVersion: 0,
  history: [],
  future: [],

  setScreen: (screen) => set({ screen }),
  beginProject: (name, audioFile) => {
    const now = markUpdated()
    set({
      screen: 'transcribing',
      projectId: crypto.randomUUID(),
      projectName: name.trim() || 'Untitled project',
      projectCreatedAt: now,
      projectUpdatedAt: now,
      audioFile,
      scenes: [],
      videoTracks: defaultVideoTracks(),
      voiceTrackSettings: defaultTrackSettings(),
      audioTrackSettings: defaultTrackSettings(),
      subtitles: [],
      mediaLibrary: [],
      audioClips: [],
      subtitleSettings: defaultSubtitleSettings,
      activeSceneId: null,
      activeAudioClipId: null,
      activeSubtitleId: null,
      currentTimeSec: 0,
      isProcessingAudio: true,
      processingError: null,
      history: [],
      future: [],
    })
  },
  loadProject: (project) => {
    const videoTracks = normalizeVideoTracks(project.videoTracks)
    const scenes = normalizeScenes(project.scenes, videoTracks[0].id)
    const subtitles = project.subtitles?.length ? project.subtitles : subtitlesFromScenes(scenes)
    set({
      screen: 'editor',
      projectId: project.id,
      projectName: project.name,
      projectCreatedAt: project.createdAt,
      projectUpdatedAt: project.updatedAt,
      audioFile: project.audioFile,
      scenes,
      videoTracks,
      voiceTrackSettings: {
        ...defaultTrackSettings(),
        ...(project.voiceTrackSettings || {}),
      },
      audioTrackSettings: {
        ...defaultTrackSettings(),
        ...(project.audioTrackSettings || {}),
      },
      subtitles,
      mediaLibrary: project.mediaLibrary || [],
      audioClips: normalizeAudioClips(project.audioClips),
      subtitleSettings: normalizeSubtitleSettings(project.subtitleSettings),
      activeSceneId: scenes[0]?.id || null,
      activeAudioClipId: null,
      activeSubtitleId: subtitles[0]?.id || null,
      currentTimeSec: 0,
      isPlaying: false,
      processingError: null,
      history: [],
      future: [],
    })
  },
  closeProject: () =>
    set({
      screen: 'projects',
      projectId: null,
      projectName: '',
      projectCreatedAt: null,
      projectUpdatedAt: null,
      audioFile: null,
      scenes: [],
      videoTracks: defaultVideoTracks(),
      voiceTrackSettings: defaultTrackSettings(),
      audioTrackSettings: defaultTrackSettings(),
      subtitles: [],
      mediaLibrary: [],
      audioClips: [],
      activeSceneId: null,
      activeAudioClipId: null,
      activeSubtitleId: null,
      currentTimeSec: 0,
      isPlaying: false,
      processingError: null,
      history: [],
      future: [],
    }),
  setProjectName: (projectName) => set({ projectName, projectUpdatedAt: markUpdated() }),
  setAudioFile: (audioFile) =>
    set((state) => historyChange(state, { audioFile })),
  setScenes: (scenes) =>
    set((state) => {
      const videoTracks = state.videoTracks.length ? state.videoTracks : defaultVideoTracks()
      const normalizedScenes = normalizeScenes(scenes, videoTracks[0].id)
      const duration = normalizedScenes.reduce(
        (max, scene) => Math.max(max, scene.endTimeSec),
        0
      )
      const subtitles = subtitlesFromScenes(normalizedScenes)
      return historyChange(state, {
        scenes: normalizedScenes,
        videoTracks,
        subtitles,
        audioFile: state.audioFile
          ? { ...state.audioFile, duration: Math.max(duration, state.audioFile.duration || 0) }
          : null,
        activeSceneId: normalizedScenes[0]?.id || null,
        activeSubtitleId: subtitles[0]?.id || null,
      })
    }),
  updateScene: (id, updates) =>
    set((state) =>
      historyChange(state, {
        scenes: state.scenes.map((scene) => (scene.id === id ? { ...scene, ...updates } : scene)),
      })
    ),
  splitScene: (id, atTimeSec) =>
    set((state) => {
      const index = state.scenes.findIndex((scene) => scene.id === id)
      const scene = state.scenes[index]
      if (!scene || atTimeSec <= scene.startTimeSec + 0.2 || atTimeSec >= scene.endTimeSec - 0.2) {
        return state
      }
      const ratio = (atTimeSec - scene.startTimeSec) / scene.durationSec
      const words = scene.transcriptText.trim().split(/\s+/).filter(Boolean)
      const wordSplit =
        words.length > 1
          ? Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)))
          : words.length
      const first: SceneSegment = {
        ...scene,
        id: crypto.randomUUID(),
        endTimeSec: atTimeSec,
        durationSec: atTimeSec - scene.startTimeSec,
        transcriptText: words.slice(0, wordSplit).join(' ') || scene.transcriptText,
      }
      const second: SceneSegment = {
        ...scene,
        id: crypto.randomUUID(),
        startTimeSec: atTimeSec,
        durationSec: scene.endTimeSec - atTimeSec,
        transcriptText: words.slice(wordSplit).join(' ') || scene.transcriptText,
        media:
          scene.media &&
          scene.media.type !== 'local_image' &&
          scene.media.type !== 'google_image' &&
          scene.media.type !== 'duckduckgo_image'
            ? {
                ...scene.media,
                sourceStartSec:
                  (scene.media.sourceStartSec ?? 0) +
                  (atTimeSec - scene.startTimeSec),
              }
            : scene.media,
      }
      const scenes = [...state.scenes]
      scenes.splice(index, 1, first, second)
      return historyChange(state, { scenes, activeSceneId: second.id })
    }),
  trimScene: (id, startTimeSec, endTimeSec, sourceStartSec) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === id
          ? {
              ...scene,
              startTimeSec,
              endTimeSec,
              durationSec: Math.max(0.2, endTimeSec - startTimeSec),
              media:
                scene.media && sourceStartSec !== undefined
                  ? { ...scene.media, sourceStartSec }
                  : scene.media,
            }
          : scene
      ),
      projectUpdatedAt: markUpdated(),
    })),
  deleteScene: (id) =>
    set((state) =>
      historyChange(state, {
        scenes: state.scenes.filter((scene) => scene.id !== id),
        activeSceneId: state.activeSceneId === id ? null : state.activeSceneId,
      })
    ),
  addVideoTrack: () =>
    set((state) =>
      historyChange(state, {
        videoTracks: [
          ...state.videoTracks,
          {
            id: crypto.randomUUID(),
            name: `Overlay ${Math.max(1, state.videoTracks.length)}`,
            muted: false,
            visible: true,
          },
        ],
      })
    ),
  removeVideoTrack: (id) =>
    set((state) => {
      const mainTrack = state.videoTracks[0]
      if (!mainTrack || id === mainTrack.id) return state
      return historyChange(state, {
        videoTracks: state.videoTracks.filter((track) => track.id !== id),
        scenes: state.scenes.map((scene) =>
          scene.trackId === id ? { ...scene, trackId: mainTrack.id } : scene
        ),
      })
    }),
  updateVideoTrack: (id, updates) =>
    set((state) =>
      historyChange(state, {
        videoTracks: state.videoTracks.map((track) =>
          track.id === id ? { ...track, ...updates } : track
        ),
      })
    ),
  updateVoiceTrackSettings: (updates) =>
    set((state) =>
      historyChange(state, {
        voiceTrackSettings: { ...state.voiceTrackSettings, ...updates },
      })
    ),
  updateAudioTrackSettings: (updates) =>
    set((state) =>
      historyChange(state, {
        audioTrackSettings: { ...state.audioTrackSettings, ...updates },
      })
    ),
  addSceneFromAsset: (asset, trackId, startTimeSec) =>
    set((state) => {
      if (asset.kind !== 'video' && asset.kind !== 'image') return state
      const id = crypto.randomUUID()
      const durationSec =
        asset.kind === 'video'
          ? Math.max(0.2, Math.min(5, asset.durationSec || 5))
          : 5
      const start = Math.max(0, startTimeSec)
      const scene: SceneSegment = {
        id,
        startTimeSec: start,
        endTimeSec: start + durationSec,
        durationSec,
        transcriptText: asset.name,
        keywords: [],
        media: {
          id: asset.id,
          type: asset.kind === 'video' ? 'local_video' : 'local_image',
          kind: asset.kind,
          sourceUrl: asset.path,
          thumbnailUrl: asset.path,
          title: asset.name,
          sourceStartSec: 0,
          sourceDurationSec: asset.durationSec,
          imageFit: 'cover',
          enableKenBurnsEffect: asset.kind === 'image',
        },
        trackId,
        volume: 1,
        scale: 1,
        opacity: 1,
      }
      return historyChange(state, {
        scenes: [...state.scenes, scene],
        activeSceneId: id,
        activeAudioClipId: null,
      })
    }),
  moveScene: (id, startTimeSec, trackId) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === id
          ? {
              ...scene,
              trackId,
              startTimeSec: Math.max(0, startTimeSec),
              endTimeSec: Math.max(0, startTimeSec) + scene.durationSec,
            }
          : scene
      ),
      projectUpdatedAt: markUpdated(),
    })),
  setActiveSceneId: (activeSceneId) =>
    set((state) => {
      const scene = state.scenes.find((item) => item.id === activeSceneId)
      const activeSubtitle =
        scene &&
        state.subtitles.find(
          (subtitle) =>
            subtitle.startTimeSec < scene.endTimeSec &&
            subtitle.endTimeSec > scene.startTimeSec
        )
      return {
        activeSceneId,
        activeAudioClipId: null,
        activeSubtitleId: activeSubtitle?.id || state.activeSubtitleId,
      }
    }),
  setActiveAudioClipId: (activeAudioClipId) =>
    set({
      activeAudioClipId,
      activeSceneId: null,
      activeSubtitleId: null,
    }),
  setActiveSubtitleId: (activeSubtitleId) => set({ activeSubtitleId }),
  updateSubtitle: (id, text) =>
    set((state) =>
      historyChange(state, {
        subtitles: state.subtitles.map((subtitle) =>
          subtitle.id === id ? { ...subtitle, text } : subtitle
        ),
      })
    ),
  splitSubtitle: (id, characterIndex) =>
    set((state) => {
      const index = state.subtitles.findIndex((subtitle) => subtitle.id === id)
      const subtitle = state.subtitles[index]
      if (!subtitle) return state
      const firstText = subtitle.text.slice(0, characterIndex).trim()
      const secondText = subtitle.text.slice(characterIndex).trim()
      if (!firstText || !secondText) return state
      const ratio = firstText.length / (firstText.length + secondText.length)
      const splitTime = Math.max(
        subtitle.startTimeSec + 0.1,
        Math.min(
          subtitle.endTimeSec - 0.1,
          subtitle.startTimeSec + (subtitle.endTimeSec - subtitle.startTimeSec) * ratio
        )
      )
      const first: SubtitleSegment = { ...subtitle, endTimeSec: splitTime, text: firstText }
      const second: SubtitleSegment = {
        id: crypto.randomUUID(),
        startTimeSec: splitTime,
        endTimeSec: subtitle.endTimeSec,
        text: secondText,
      }
      const subtitles = [...state.subtitles]
      subtitles.splice(index, 1, first, second)
      return historyChange(state, { subtitles, activeSubtitleId: second.id })
    }),
  setCurrentTimeSec: (currentTimeSec) => set({ currentTimeSec }),
  requestSeek: (seekTargetSec) =>
    set((state) => ({
      seekTargetSec,
      seekVersion: state.seekVersion + 1,
      currentTimeSec: seekTargetSec,
    })),
  requestPlayback: (playbackCommand = 'toggle') =>
    set((state) => ({
      playbackCommand,
      playbackVersion: state.playbackVersion + 1,
    })),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setApiKeys: (keys) => set((state) => ({ apiKeys: { ...state.apiKeys, ...keys } })),
  setIsProcessingAudio: (isProcessingAudio) => set({ isProcessingAudio }),
  setProcessingError: (processingError) => set({ processingError }),
  setExportProgress: (exportProgress) => set({ exportProgress }),
  addMediaAssets: (assets) =>
    set((state) => {
      const existing = new Set(state.mediaLibrary.map((asset) => asset.path))
      return historyChange(state, {
        mediaLibrary: [...state.mediaLibrary, ...assets.filter((asset) => !existing.has(asset.path))],
      })
    }),
  removeMediaAsset: (id) =>
    set((state) =>
      historyChange(state, {
        mediaLibrary: state.mediaLibrary.filter((asset) => asset.id !== id),
      })
    ),
  assignMediaToScene: (sceneId, media) =>
    set((state) =>
      historyChange(state, {
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene
          const normalizedMedia = {
            ...media,
            sourceStartSec: media.sourceStartSec ?? 0,
            sourceDurationSec: media.sourceDurationSec ?? media.durationSec,
          }
          const isImage =
            normalizedMedia.type === 'local_image' ||
            normalizedMedia.type === 'google_image' ||
            normalizedMedia.type === 'duckduckgo_image'
          const maximumDuration =
            !isImage && normalizedMedia.sourceDurationSec
              ? Math.max(
                  1 / 30,
                  normalizedMedia.sourceDurationSec -
                    (normalizedMedia.sourceStartSec ?? 0)
                )
              : Number.POSITIVE_INFINITY
          const durationSec = Math.min(scene.durationSec, maximumDuration)
          return {
            ...scene,
            media: normalizedMedia,
            durationSec,
            endTimeSec: scene.startTimeSec + durationSec,
          }
        }),
      })
    ),
  addAudioClip: (asset, startTimeSec) =>
    set((state) => {
      const id = crypto.randomUUID()
      return historyChange(state, {
        audioClips: [
          ...state.audioClips,
          {
            id,
            name: asset.name,
            path: asset.path,
            kind: asset.kind === 'sfx' ? 'sfx' : 'music',
            startTimeSec: Math.max(0, startTimeSec ?? state.currentTimeSec),
            durationSec: asset.durationSec || 10,
            sourceStartSec: 0,
            sourceDurationSec: asset.durationSec,
            volume: asset.kind === 'sfx' ? 1 : 0.35,
          },
        ],
        activeAudioClipId: id,
        activeSceneId: null,
      })
    }),
  removeAudioClip: (id) =>
    set((state) =>
      historyChange(state, {
        audioClips: state.audioClips.filter((clip) => clip.id !== id),
        activeAudioClipId: state.activeAudioClipId === id ? null : state.activeAudioClipId,
      })
    ),
  moveAudioClip: (id, startTimeSec) =>
    set((state) => ({
      audioClips: state.audioClips.map((clip) =>
        clip.id === id ? { ...clip, startTimeSec: Math.max(0, startTimeSec) } : clip
      ),
      projectUpdatedAt: markUpdated(),
    })),
  updateAudioClip: (id, updates) =>
    set((state) =>
      historyChange(state, {
        audioClips: state.audioClips.map((clip) =>
          clip.id === id
            ? (() => {
                const merged = { ...clip, ...updates }
                const sourceStartSec = Math.max(0, merged.sourceStartSec ?? 0)
                const maximumDuration = merged.sourceDurationSec
                  ? Math.max(0.05, merged.sourceDurationSec - sourceStartSec)
                  : Number.POSITIVE_INFINITY
                return {
                  ...merged,
                  sourceStartSec,
                  durationSec: Math.max(
                    0.05,
                    Math.min(merged.durationSec, maximumDuration)
                  ),
                }
              })()
            : clip
        ),
      })
    ),
  trimAudioClip: (id, startTimeSec, durationSec, sourceStartSec) =>
    set((state) => ({
      audioClips: state.audioClips.map((clip) =>
        clip.id === id
          ? {
              ...clip,
              startTimeSec: Math.max(0, startTimeSec),
              durationSec: Math.max(0.05, durationSec),
              sourceStartSec: Math.max(0, sourceStartSec),
            }
          : clip
      ),
      projectUpdatedAt: markUpdated(),
    })),
  updateSubtitleSettings: (updates) =>
    set((state) =>
      historyChange(state, {
        subtitleSettings: { ...state.subtitleSettings, ...updates },
      })
    ),
  checkpointHistory: () =>
    set((state) => ({
      history: [...state.history.slice(-49), capture(state)],
      future: [],
    })),
  undo: () =>
    set((state) => {
      const previous = state.history[state.history.length - 1]
      if (!previous) return state
      return {
        ...previous,
        ...restoredSelection(state, previous),
        history: state.history.slice(0, -1),
        future: [capture(state), ...state.future.slice(0, 49)],
        projectUpdatedAt: markUpdated(),
      }
    }),
  redo: () =>
    set((state) => {
      const next = state.future[0]
      if (!next) return state
      return {
        ...next,
        ...restoredSelection(state, next),
        history: [...state.history.slice(-49), capture(state)],
        future: state.future.slice(1),
        projectUpdatedAt: markUpdated(),
      }
    }),
}))

export function getProjectDocument(): ProjectDocument | null {
  const state = useEditorStore.getState()
  if (!state.projectId || !state.projectCreatedAt) return null

  return {
    id: state.projectId,
    name: state.projectName,
    createdAt: state.projectCreatedAt,
    updatedAt: state.projectUpdatedAt || markUpdated(),
    audioFile: state.audioFile,
    scenes: state.scenes,
    videoTracks: state.videoTracks,
    voiceTrackSettings: state.voiceTrackSettings,
    audioTrackSettings: state.audioTrackSettings,
    subtitles: state.subtitles,
    mediaLibrary: state.mediaLibrary,
    audioClips: state.audioClips,
    subtitleSettings: state.subtitleSettings,
  }
}
