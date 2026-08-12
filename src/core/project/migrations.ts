import { MediaType, ProjectDocument } from '../../types/editor'

export const CURRENT_PROJECT_SCHEMA_VERSION = 3

const legacyMediaType = (type: string): MediaType => {
  if (type === 'pexels_video') return 'remote_video' as const
  if (type === 'youtube_clip') return 'local_video' as const
  if (type === 'google_image' || type === 'duckduckgo_image') {
    return 'remote_image' as const
  }
  return type as MediaType
}

export function migrateProject(input: ProjectDocument | Record<string, unknown>) {
  const project = structuredClone(input) as ProjectDocument
  const version = Number(project.schemaVersion || 1)
  if (version > CURRENT_PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `This project uses schema ${version}, but this version of Rhymx supports up to ${CURRENT_PROJECT_SCHEMA_VERSION}.`
    )
  }
  project.schemaVersion = CURRENT_PROJECT_SCHEMA_VERSION
  project.mediaLibrary ||= []
  project.audioClips ||= []
  project.subtitles ||= []
  project.visualGapsFilled ??= false
  project.scenes = (project.scenes || []).map((scene) => {
    if (!scene.media) return scene
    const legacyType = String(scene.media.type)
    const provider = legacyType === 'pexels_video'
      ? 'pexels'
      : legacyType === 'youtube_clip'
        ? 'youtube'
        : legacyType === 'google_image' || legacyType === 'duckduckgo_image'
          ? 'wikimedia'
          : 'local'
    return {
      ...scene,
      media: {
        ...scene.media,
        type: legacyMediaType(legacyType),
        provenance: scene.media.provenance || {
          provider,
          sourceId: scene.media.id,
          landingPageUrl: scene.media.providerUrl,
          creator: scene.media.creatorName,
          creatorUrl: scene.media.creatorUrl,
        },
      },
    }
  })
  project.subtitleSettings = {
    ...project.subtitleSettings,
    mode: project.subtitleSettings?.mode || 'sentence',
    activeWordColor: project.subtitleSettings?.activeWordColor || '#c4b5fd',
    maximumCharactersPerLine:
      project.subtitleSettings?.maximumCharactersPerLine || 42,
    minimumDisplayDurationSec:
      project.subtitleSettings?.minimumDisplayDurationSec || 0.7,
    maximumDisplayDurationSec:
      project.subtitleSettings?.maximumDisplayDurationSec || 6,
  }
  project.captionWords ||= project.subtitles.flatMap((subtitle) => subtitle.words || [])
  return project
}

