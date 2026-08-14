const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'before', 'being', 'between',
  'could', 'does', 'doing', 'during', 'each', 'from', 'have', 'here', 'into',
  'just', 'more', 'most', 'only', 'other', 'over', 'same', 'should', 'some',
  'such', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'under', 'very', 'want', 'were', 'what', 'when',
  'where', 'which', 'while', 'with', 'would', 'your',
])

function cleanPhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function rankWords(words: string[]) {
  const counts = new Map<string, number>()
  const firstIndex = new Map<string, number>()
  words.forEach((word, index) => {
    counts.set(word, (counts.get(word) || 0) + 1)
    if (!firstIndex.has(word)) firstIndex.set(word, index)
  })
  return [...counts.keys()].sort(
    (first, second) =>
      (counts.get(second) || 0) - (counts.get(first) || 0) ||
      (firstIndex.get(first) || 0) - (firstIndex.get(second) || 0)
  )
}

export function recommendedSearchKeywords(
  transcriptText: string,
  generated: string[] = [],
  narrativeContext = ''
) {
  const recommendations: string[] = []
  const add = (value: string) => {
    const phrase = cleanPhrase(value)
    if (phrase.length >= 3 && !recommendations.includes(phrase)) recommendations.push(phrase)
  }

  generated.forEach(add)

  const words = cleanPhrase(transcriptText)
    .split(' ')
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  const ranked = rankWords(words)

  if (!generated.length && narrativeContext) {
    const contextWords = cleanPhrase(narrativeContext)
      .split(' ')
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    const contextRanked = rankWords(contextWords)
    add([...contextRanked.slice(0, 2), ...ranked.slice(0, 2)].join(' '))
  }

  add(ranked.slice(0, 4).join(' '))
  add(ranked.slice(0, 2).join(' '))
  for (let index = 0; index < words.length - 1 && recommendations.length < 3; index += 1) {
    add(words.slice(index, index + 3).join(' '))
  }

  return recommendations.slice(0, 3)
}
