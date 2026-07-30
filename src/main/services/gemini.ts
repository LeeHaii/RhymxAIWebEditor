import { GoogleGenAI } from '@google/genai'
import fs from 'fs/promises'
import path from 'path'

const TRANSCRIPTION_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest'] as const

function isUnavailableModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('"code":404') ||
    message.includes('"status":"NOT_FOUND"') ||
    /model.+(?:not found|no longer available)/i.test(message)
  )
}

function normalizeSceneLength(scenes: any[]) {
  const normalized: any[] = []
  for (const scene of scenes) {
    const start = Number(scene.startTimeSec) || 0
    const end = Number(scene.endTimeSec) || start
    const duration = Math.max(0, end - start)
    const chunkCount = duration > 6.5 ? Math.max(2, Math.round(duration / 5)) : 1
    const words = String(scene.transcriptText || '').trim().split(/\s+/).filter(Boolean)

    for (let index = 0; index < chunkCount; index += 1) {
      const chunkStart = start + (duration * index) / chunkCount
      const chunkEnd = start + (duration * (index + 1)) / chunkCount
      const wordStart = Math.round((words.length * index) / chunkCount)
      const wordEnd = Math.round((words.length * (index + 1)) / chunkCount)
      normalized.push({
        ...scene,
        id: `scene_${normalized.length + 1}`,
        startTimeSec: chunkStart,
        endTimeSec: chunkEnd,
        durationSec: chunkEnd - chunkStart,
        transcriptText: words.slice(wordStart, wordEnd).join(' '),
      })
    }
  }
  return normalized
}

export async function transcribeAudio(filePath: string, apiKey: string): Promise<any[]> {
  const trimmedApiKey = apiKey.trim()
  if (!trimmedApiKey) {
    throw new Error('A Gemini API key is required.')
  }

  const ai = new GoogleGenAI({ apiKey: trimmedApiKey })

  try {
    const fileBytes = await fs.readFile(filePath)
    const base64Audio = fileBytes.toString('base64')
    // Get extension without dot
    const ext = path.extname(filePath).slice(1).toLowerCase() || 'mp3'
    const mimeTypes: Record<string, string> = {
      aac: 'audio/aac',
      flac: 'audio/flac',
      m4a: 'audio/mp4',
      mp3: 'audio/mp3',
      mp4: 'audio/mp4',
      ogg: 'audio/ogg',
      opus: 'audio/ogg',
      wav: 'audio/wav',
      webm: 'audio/webm'
    }
    const mimeType = mimeTypes[ext] || 'audio/mp3'

    const prompt = `
      Listen to the following audio voiceover.
      Split it into logical scenes that target 5 seconds each.
      Prefer 4 to 6 seconds per scene and avoid scenes longer than 6 seconds.
      For each scene, output:
      1. id: "scene_X"
      2. startTimeSec: float in seconds
      3. endTimeSec: float in seconds
      4. durationSec: float in seconds
      5. transcriptText: the spoken text in this scene
      6. keywords: an array of 2-3 visual keywords describing the scene for stock footage search (e.g. ["airplane flying", "cloudy sky"]).
      
      Respond ONLY with valid JSON in this format:
      {
        "scenes": [
          {
            "id": "scene_1",
            "startTimeSec": 0.0,
            "endTimeSec": 4.5,
            "durationSec": 4.5,
            "transcriptText": "...",
            "keywords": ["..."]
          }
        ]
      }
    `

    let text: string | undefined
    for (const [index, model] of TRANSCRIPTION_MODELS.entries()) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: base64Audio
              }
            }
          ],
          config: {
            responseMimeType: 'application/json'
          }
        })
        text = response.text
        break
      } catch (error) {
        const hasFallback = index < TRANSCRIPTION_MODELS.length - 1
        if (!hasFallback || !isUnavailableModelError(error)) throw error
        console.warn(`Gemini model ${model} is unavailable; trying the current Flash alias.`)
      }
    }

    if (!text) {
      throw new Error("No response from Gemini")
    }

    const json = JSON.parse(text)
    return normalizeSceneLength(json.scenes || [])

  } catch (error) {
    console.error("Transcription error:", error)
    throw error
  }
}
