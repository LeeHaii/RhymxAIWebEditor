import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  buildMotionComposition,
  canonicalMotionRenderRequest,
  validateMotionRenderRequest,
} from './local-motion-template.mjs'

const SERVICE_VERSION = '1.0.2'
const HOST = '127.0.0.1'
const PORT = Number(process.env.RHYMX_MOTION_PORT || 43127)
const MAX_BODY_BYTES = 64 * 1024
const MAX_JOBS = 100
const MAX_CONCURRENT_RENDERS = Math.max(1, Math.min(2, Number(process.env.RHYMX_MOTION_CONCURRENCY || 1)))
const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cacheDirectory = path.join(rootDirectory, '.cache', 'rhymx-motion')
const projectDirectory = path.join(cacheDirectory, 'projects')
const outputDirectory = path.join(cacheDirectory, 'outputs')
const gsapSourcePath = path.join(rootDirectory, 'node_modules', 'gsap', 'dist', 'gsap.min.js')
const producerPackagePath = path.join(rootDirectory, 'node_modules', '@hyperframes', 'producer', 'package.json')
const allowedOrigins = new Set(
  (process.env.RHYMX_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
)
const sessionToken = randomBytes(32).toString('base64url')
const jobs = new Map()
const queue = []
let activeRenders = 0
let shuttingDown = false
let producer
let hyperframesVersion = 'unknown'
let ffmpegVersion = 'unknown'

function nodeVersionSupported() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  return major > 22 || (major === 22 && minor >= 12)
}

function responseHeaders(request, contentType = 'application/json; charset=utf-8') {
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }
  const origin = request.headers.origin
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers.Vary = 'Origin'
  }
  return headers
}

function sendJson(request, response, status, body) {
  response.writeHead(status, responseHeaders(request))
  response.end(JSON.stringify(body))
}

function originAllowed(request) {
  const origin = request.headers.origin
  return !origin || allowedOrigins.has(origin)
}

function authorized(request) {
  const supplied = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const expected = Buffer.from(sessionToken)
  const actual = Buffer.from(supplied)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

async function readJsonBody(request) {
  const chunks = []
  let received = 0
  for await (const chunk of request) {
    received += chunk.length
    if (received > MAX_BODY_BYTES) throw new Error('Request body exceeds 64 KB.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function publicJob(job) {
  return {
    id: job.id,
    cacheKey: job.cacheKey,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
    cached: job.cached,
    renderedAt: job.renderedAt,
  }
}

function cacheKeyFor(request) {
  return createHash('sha256')
    .update(`${SERVICE_VERSION}\n${canonicalMotionRenderRequest(request)}`)
    .digest('hex')
    .slice(0, 32)
}

function outputPathFor(cacheKey) {
  return path.join(outputDirectory, `${cacheKey}.mp4`)
}

async function finishFromCache(request, cacheKey) {
  const outputPath = outputPathFor(cacheKey)
  if (!existsSync(outputPath)) return null
  const info = await stat(outputPath)
  const job = {
    id: randomBytes(12).toString('hex'),
    request,
    cacheKey,
    outputPath,
    status: 'complete',
    progress: 100,
    message: 'Reused cached local render.',
    cached: true,
    renderedAt: info.mtime.toISOString(),
  }
  jobs.set(job.id, job)
  return job
}

function pruneJobs() {
  if (jobs.size <= MAX_JOBS) return
  for (const [id, job] of jobs) {
    if (['complete', 'failed', 'cancelled'].includes(job.status)) jobs.delete(id)
    if (jobs.size <= MAX_JOBS) break
  }
}

async function execute(job) {
  activeRenders += 1
  job.status = 'rendering'
  job.progress = 1
  job.message = 'Preparing the HyperFrames composition.'
  const renderProjectDirectory = path.join(projectDirectory, job.id)
  const temporaryOutput = path.join(outputDirectory, `${job.cacheKey}.${job.id}.mp4`)
  try {
    await mkdir(renderProjectDirectory, { recursive: true })
    await copyFile(gsapSourcePath, path.join(renderProjectDirectory, 'gsap.min.js'))
    await writeFile(
      path.join(renderProjectDirectory, 'index.html'),
      buildMotionComposition(job.request),
      'utf8'
    )
    const renderJob = producer.createRenderJob({
      fps: job.request.fps,
      quality: 'standard',
      format: 'mp4',
      workers: 1,
      strictness: 'best-effort',
      crf: 20,
      hdrMode: 'force-sdr',
    })
    job.controller = new AbortController()
    await producer.executeRenderJob(
      renderJob,
      renderProjectDirectory,
      temporaryOutput,
      (currentJob, message) => {
        job.progress = Math.max(1, Math.min(99, Number(currentJob.progress) || job.progress))
        job.message = message || currentJob.currentStage || 'Rendering locally.'
      },
      job.controller.signal
    )
    const finalOutput = outputPathFor(job.cacheKey)
    if (existsSync(finalOutput)) await rm(temporaryOutput, { force: true })
    else await rename(temporaryOutput, finalOutput)
    job.outputPath = finalOutput
    job.status = 'complete'
    job.progress = 100
    job.message = 'Local HyperFrames render complete.'
    job.renderedAt = new Date().toISOString()
  } catch (error) {
    await rm(temporaryOutput, { force: true }).catch(() => undefined)
    const cancelled = job.controller?.signal.aborted || error?.name === 'RenderCancelledError'
    job.status = cancelled ? 'cancelled' : 'failed'
    job.error = cancelled ? 'Motion render cancelled.' : error instanceof Error ? error.message : String(error)
    job.message = job.error
  } finally {
    delete job.controller
    await rm(renderProjectDirectory, { recursive: true, force: true }).catch(() => undefined)
    activeRenders -= 1
    void processQueue()
  }
}

async function processQueue() {
  if (shuttingDown) return
  while (activeRenders < MAX_CONCURRENT_RENDERS && queue.length) {
    const job = queue.shift()
    if (!job || job.status === 'cancelled') continue
    void execute(job)
  }
}

async function createJob(input) {
  const request = validateMotionRenderRequest(input)
  const cacheKey = cacheKeyFor(request)
  const cached = await finishFromCache(request, cacheKey)
  if (cached) return cached
  const existing = [...jobs.values()].find(
    (job) => job.cacheKey === cacheKey && ['queued', 'rendering'].includes(job.status)
  )
  if (existing) return existing
  const job = {
    id: randomBytes(12).toString('hex'),
    request,
    cacheKey,
    outputPath: outputPathFor(cacheKey),
    status: 'queued',
    progress: 0,
    message: 'Queued for local rendering.',
    cached: false,
  }
  jobs.set(job.id, job)
  queue.push(job)
  pruneJobs()
  void processQueue()
  return job
}

async function route(request, response) {
  if (!originAllowed(request)) return sendJson(request, response, 403, { error: 'This browser origin is not allowed to use the local renderer.' })
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      ...responseHeaders(request),
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
      'Access-Control-Max-Age': '600',
    })
    return response.end()
  }
  const url = new URL(request.url || '/', `http://${HOST}:${PORT}`)
  if (url.pathname === '/health' && request.method === 'GET') {
    return sendJson(request, response, 200, {
      available: true,
      serviceVersion: SERVICE_VERSION,
      hyperframesVersion,
      nodeVersion: process.versions.node,
      ffmpegVersion,
      activeRenders,
      queuedRenders: queue.length,
    })
  }
  if (url.pathname === '/session' && request.method === 'GET') {
    return sendJson(request, response, 200, { token: sessionToken })
  }
  if (!authorized(request)) return sendJson(request, response, 401, { error: 'A valid per-launch local renderer token is required.' })
  if (url.pathname === '/renders' && request.method === 'POST') {
    try {
      return sendJson(request, response, 202, publicJob(await createJob(await readJsonBody(request))))
    } catch (error) {
      return sendJson(request, response, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }
  const match = url.pathname.match(/^\/renders\/([a-f0-9]+)(?:\/(output))?$/)
  if (match) {
    const job = jobs.get(match[1])
    if (!job) return sendJson(request, response, 404, { error: 'Render job not found.' })
    if (match[2] === 'output' && request.method === 'GET') {
      if (job.status !== 'complete' || !existsSync(job.outputPath)) return sendJson(request, response, 409, { error: 'Render output is not ready.' })
      const info = await stat(job.outputPath)
      response.writeHead(200, {
        ...responseHeaders(request, 'video/mp4'),
        'Content-Length': String(info.size),
        'Content-Disposition': `inline; filename="rhymx-motion-${job.cacheKey}.mp4"`,
      })
      return createReadStream(job.outputPath).pipe(response)
    }
    if (request.method === 'GET') return sendJson(request, response, 200, publicJob(job))
    if (request.method === 'DELETE') {
      if (job.status === 'queued') {
        job.status = 'cancelled'
        job.message = 'Motion render cancelled.'
      } else if (job.status === 'rendering') job.controller?.abort()
      return sendJson(request, response, 200, publicJob(job))
    }
  }
  return sendJson(request, response, 404, { error: 'Local renderer route not found.' })
}

async function start() {
  if (!nodeVersionSupported()) {
    throw new Error(`HyperFrames 0.7.107 requires Node.js 22.12 or newer. Current version: ${process.versions.node}`)
  }
  if (!existsSync(producerPackagePath) || !existsSync(gsapSourcePath)) {
    throw new Error('Local motion dependencies are missing. Run npm install first.')
  }
  hyperframesVersion = JSON.parse(await readFile(producerPackagePath, 'utf8')).version
  ffmpegVersion = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8', windowsHide: true })
    .split(/\r?\n/)[0]
    .replace(/^ffmpeg version\s+/, '')
    .split(/\s+/)[0]
  producer = await import('@hyperframes/producer')
  await mkdir(projectDirectory, { recursive: true })
  await mkdir(outputDirectory, { recursive: true })
  await rm(projectDirectory, { recursive: true, force: true })
  await mkdir(projectDirectory, { recursive: true })
  const server = createServer((request, response) => {
    void route(request, response).catch((error) => sendJson(request, response, 500, {
      error: error instanceof Error ? error.message : String(error),
    }))
  })
  server.listen(PORT, HOST, () => {
    console.log(`Rhymx local HyperFrames renderer ${SERVICE_VERSION}`)
    console.log(`Listening on http://${HOST}:${PORT}`)
    console.log(`HyperFrames ${hyperframesVersion} · Node ${process.versions.node}`)
  })
  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    for (const job of jobs.values()) job.controller?.abort()
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 5000).unref()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

start().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
