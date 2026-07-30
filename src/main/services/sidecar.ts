import { execFile } from 'child_process'
import path from 'path'
import { pathToFileURL } from 'node:url'
import fs from 'fs/promises'

// Helper to run yt-dlp
export async function trimYouTube(
  url: string,
  startTime: number,
  endTime: number,
  cacheDirectory: string
): Promise<string> {
  await fs.mkdir(cacheDirectory, { recursive: true })
  const outputPath = path.join(cacheDirectory, `rhymx_clip_${Date.now()}.mp4`)

  // In production, you would resolve the path to the bundled executable in process.resourcesPath.
  // For development, we assume `yt-dlp` is in the system PATH.
  const ytdlpPath = 'yt-dlp'

  const args = [
    url,
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--download-sections', `*${startTime}-${endTime}`,
    '--force-keyframes-at-cuts',
    '-o', outputPath
  ]

  return new Promise((resolve, reject) => {
    execFile(ytdlpPath, args, (error, stdout, stderr) => {
      if (error) {
        console.error('yt-dlp error:', error)
        reject(error)
      } else {
        resolve(pathToFileURL(outputPath).toString())
      }
    })
  })
}
