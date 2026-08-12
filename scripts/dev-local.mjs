import { spawn } from 'node:child_process'
import process from 'node:process'

const children = [
  // Launch Node entry points directly. Spawning npm.cmd is unreliable on
  // Windows with newer Node releases and can fail immediately with EINVAL.
  spawn(process.execPath, ['scripts/local-motion-server.mjs'], {
    stdio: 'inherit',
    windowsHide: true,
  }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
    stdio: 'inherit',
    windowsHide: true,
  }),
]

let exiting = false
function shutdown(code = 0) {
  if (exiting) return
  exiting = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 1000).unref()
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(`Failed to start a local service: ${error.message}`)
    shutdown(1)
  })
  child.on('exit', (code) => {
    if (!exiting && code) shutdown(code)
  })
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
