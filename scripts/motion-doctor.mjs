import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const checks = []
const [major, minor] = process.versions.node.split('.').map(Number)
const nodeOkay = major > 22 || (major === 22 && minor >= 12)
checks.push({ name: 'Node.js', okay: nodeOkay, detail: `v${process.versions.node}${nodeOkay ? '' : ' (requires 22.12+)'}` })

try {
  const version = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8', windowsHide: true })
    .split(/\r?\n/)[0]
    .replace(/^ffmpeg version\s+/, '')
  checks.push({ name: 'FFmpeg', okay: true, detail: version.slice(0, 90) })
} catch {
  checks.push({ name: 'FFmpeg', okay: false, detail: 'not found on PATH' })
}

for (const [name, relativePath] of [
  ['HyperFrames producer', 'node_modules/@hyperframes/producer/package.json'],
  ['GSAP runtime', 'node_modules/gsap/dist/gsap.min.js'],
]) {
  checks.push({ name, okay: existsSync(path.resolve(relativePath)), detail: existsSync(path.resolve(relativePath)) ? 'installed' : 'run npm install' })
}

for (const check of checks) console.log(`${check.okay ? '✓' : '✗'} ${check.name.padEnd(22)} ${check.detail}`)
if (checks.some((check) => !check.okay)) process.exitCode = 1
