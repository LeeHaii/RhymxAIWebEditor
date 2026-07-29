import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import path from 'path'
import { app } from 'electron'
import { SubtitleSettings, TimelineAudioClip } from '../../types/editor'

export async function exportVideo(
  scenes: any[],
  audioPath: string,
  audioClips: TimelineAudioClip[],
  subtitleSettings: SubtitleSettings | undefined,
  onProgress: (progress: number) => void
): Promise<void> {
  try {
    // Determine where the Remotion composition is. In dev, we can point to src/remotion/index.ts
    // In prod, this would need to be bundled separately or passed differently.
    const compositionEntry = path.join(process.cwd(), 'src', 'remotion', 'index.ts')

    // Bundle the remotion project
    const bundled = await bundle({
      entryPoint: compositionEntry,
      webpackOverride: (config) => config,
    })

    // Fetch the composition
    const composition = await selectComposition({
      serveUrl: bundled,
      id: 'MainComposition',
      inputProps: {
        scenes,
        audioPath,
        audioClips,
        subtitleSettings,
      },
    })

    const outputPath = path.join(app.getPath('downloads'), `AI_Video_${Date.now()}.mp4`)

    // Render it
    await renderMedia({
      composition,
      serveUrl: bundled,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: {
        scenes,
        audioPath,
        audioClips,
        subtitleSettings,
      },
      onProgress: ({ progress }) => {
        onProgress(Math.round(progress * 100))
      },
    })

    console.log('Rendered to:', outputPath)
  } catch (err) {
    console.error('Export failed:', err)
    throw err
  }
}
