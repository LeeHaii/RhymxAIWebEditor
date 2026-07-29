import { execFile } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'

// Helper to run yt-dlp
export async function trimYouTube(url: string, startTime: number, endTime: number): Promise<string> {
  const tempDir = os.tmpdir()
  const outputPath = path.join(tempDir, `clip_${Date.now()}.mp4`)

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
        // Return as a local file URL
        resolve(`file://${outputPath}`)
      }
    })
  })
}
