import { SceneSegment } from '../../types/editor'

type SceneLike = Pick<SceneSegment, 'id' | 'transcriptText'>

const MAX_NARRATIVE_CHARACTERS = 60_000

export interface SceneIntelligenceSuggestion {
  id: string
  visualIntent: string
  keywords: string[]
  treatment: 'media' | 'motion'
}

export function buildNarrativeContext(scenes: SceneLike[]) {
  const context = scenes
    .map((scene, index) => `[Scene ${index + 1}] ${scene.transcriptText.trim()}`)
    .join('\n')

  if (context.length <= MAX_NARRATIVE_CHARACTERS) return context

  const half = Math.floor(MAX_NARRATIVE_CHARACTERS / 2)
  return `${context.slice(0, half)}\n[Middle of narration omitted for request size]\n${context.slice(-half)}`
}

export function buildSceneIntelligenceMessages(
  allScenes: SceneLike[],
  focusScenes: SceneLike[] = allScenes
) {
  const indexById = new Map(allScenes.map((scene, index) => [scene.id, index]))
  const focus = focusScenes.map((scene) => {
    const index = indexById.get(scene.id) ?? 0
    return {
      id: scene.id,
      sceneNumber: index + 1,
      transcriptText: scene.transcriptText,
      previousScene: allScenes[index - 1]?.transcriptText || '',
      nextScene: allScenes[index + 1]?.transcriptText || '',
    }
  })

  return [
    {
      role: 'system' as const,
      content: [
        'You are the visual director for one complete narrated video.',
        'Understand the full narration, recurring subjects, named entities, setting, tone, and argument before planning individual scenes.',
        'For every requested scene, return a visualIntent that describes the shot the viewer should see, not a transcript summary.',
        'Return exactly three distinct English stock-media search phrases. Each phrase must be concrete and visually searchable, using observable subjects, actions, locations, eras, or camera framing.',
        'Resolve pronouns and abstract language from the full narration. Do not merely extract nearby words, do not repeat the same phrase with tiny changes, and do not invent unsupported people, brands, or events.',
        'Use treatment "motion" only when designed typography, a statistic, quotation, comparison, title, diagram, transition, or call to action communicates better than footage. Otherwise use "media".',
        'Return only JSON: {"scenes":[{"id":"supplied id","visualIntent":"concise shot direction","keywords":["phrase 1","phrase 2","phrase 3"],"treatment":"media or motion"}]}.',
      ].join(' '),
    },
    {
      role: 'user' as const,
      content: JSON.stringify({
        fullNarration: buildNarrativeContext(allScenes),
        scenesToPlan: focus,
      }),
    },
  ]
}

export function parseSceneIntelligence(content: string) {
  const parsed = JSON.parse(content) as {
    scenes?: Array<{
      id?: unknown
      visualIntent?: unknown
      keywords?: unknown
      treatment?: unknown
    }>
  }

  const suggestions = new Map<string, SceneIntelligenceSuggestion>()
  for (const value of parsed.scenes || []) {
    const id = String(value.id || '').trim()
    if (!id || !Array.isArray(value.keywords)) continue
    const keywords = value.keywords
      .map((keyword) => String(keyword).trim())
      .filter(Boolean)
      .slice(0, 3)
    if (!keywords.length) continue
    suggestions.set(id, {
      id,
      visualIntent: String(value.visualIntent || keywords[0]).trim().slice(0, 220),
      keywords,
      treatment: value.treatment === 'motion' ? 'motion' : 'media',
    })
  }
  return suggestions
}
