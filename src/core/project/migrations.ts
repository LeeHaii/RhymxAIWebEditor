import { ProjectDocument } from '../../types/editor'

export const CURRENT_PROJECT_SCHEMA_VERSION = 2

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
  return project
}

