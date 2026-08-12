import { SubtitleSegment } from '../../types/editor'

const pad = (value: number, length = 2) => String(value).padStart(length, '0')

function timestamp(seconds: number, separator: ',' | '.') {
  const whole = Math.max(0, Math.floor(seconds))
  const milliseconds = Math.round((seconds - whole) * 1000)
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}${separator}${pad(milliseconds, 3)}`
}

export function captionsToSrt(subtitles: SubtitleSegment[]) {
  return subtitles.map((subtitle, index) => `${index + 1}\n${timestamp(subtitle.startTimeSec, ',')} --> ${timestamp(subtitle.endTimeSec, ',')}\n${subtitle.text}`).join('\n\n')
}

export function captionsToVtt(subtitles: SubtitleSegment[]) {
  return `WEBVTT\n\n${subtitles.map((subtitle) => `${timestamp(subtitle.startTimeSec, '.')} --> ${timestamp(subtitle.endTimeSec, '.')}\n${subtitle.text}`).join('\n\n')}`
}

function secondsForTimestamp(value: string) {
  const match = value.trim().match(/(\d+):(\d{2}):(\d{2})[,.](\d{3})/)
  if (!match) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
}

export function parseCaptions(text: string): SubtitleSegment[] {
  const blocks = text.replace(/^WEBVTT[^\n]*\n+/i, '').trim().split(/\n\s*\n/)
  return blocks.flatMap((block, index) => {
    const lines = block.split(/\r?\n/)
    const timingIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingIndex < 0) return []
    const [startRaw, endRaw] = lines[timingIndex].split('-->')
    const startTimeSec = secondsForTimestamp(startRaw)
    const endTimeSec = secondsForTimestamp(endRaw)
    if (startTimeSec === null || endTimeSec === null || endTimeSec <= startTimeSec) return []
    return [{
      id: `caption_import_${index}_${crypto.randomUUID()}`,
      startTimeSec,
      endTimeSec,
      text: lines.slice(timingIndex + 1).join('\n').replace(/<[^>]+>/g, '').trim(),
    }]
  })
}

export function saveCaptionFile(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

