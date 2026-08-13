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

export function recommendedSearchKeywords(
  transcriptText: string,
  generated: string[] = []
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
  const ranked = [...new Set(words)].sort((first, second) => {
    const frequency = words.filter((word) => word === second).length -
      words.filter((word) => word === first).length
    return frequency || words.indexOf(first) - words.indexOf(second)
  })

  add(ranked.slice(0, 4).join(' '))
  add(ranked.slice(0, 2).join(' '))
  for (let index = 0; index < words.length - 1 && recommendations.length < 3; index += 1) {
    add(words.slice(index, index + 3).join(' '))
  }

  return recommendations.slice(0, 3)
}
