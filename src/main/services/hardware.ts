import { execFileSync } from 'node:child_process'
import { EncoderCapabilities } from '../../types/editor'

export function getEncoderCapabilities(): EncoderCapabilities {
  let gpuNames: string[] = []
  if (process.platform === 'win32') {
    try {
      const output = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name) | ConvertTo-Json -Compress',
        ],
        { encoding: 'utf8', timeout: 10000, windowsHide: true }
      ).trim()
      if (output) {
        const parsed = JSON.parse(output) as string | string[]
        gpuNames = Array.isArray(parsed) ? parsed : [parsed]
      }
    } catch (error) {
      console.warn('Could not inspect video controllers.', error)
    }
  }

  return {
    cpu: true,
    nvenc: gpuNames.some((name) => /nvidia/i.test(name)),
    amdGpuDetected: gpuNames.some((name) => /\b(amd|radeon)\b/i.test(name)),
    gpuNames,
  }
}
