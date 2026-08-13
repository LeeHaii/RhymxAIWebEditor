const PROVIDERS = ['pexels', 'pixabay', 'archive_org', 'nasa', 'wikimedia']
const rateWindows = new Map()

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  },
})

const errorResponse = (message, status = 400) => json({ error: message }, status)

function actorFor(request) {
  const raw = request.headers.get('X-Rhymx-Actor') || 'guest'
  return { kind: 'anonymous', id: raw.slice(0, 96) }
}

function enforceRateLimit(actor, bucket, maximum, windowMs) {
  const now = Date.now()
  const key = `${bucket}:${actor.id}`
  const current = rateWindows.get(key)
  if (!current || current.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  current.count += 1
  if (current.count > maximum) throw new Response(JSON.stringify({ error: 'Anonymous request limit reached. Try again shortly.' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil((current.resetAt - now) / 1000)) } })
}

async function timedFetch(url, init = {}, timeoutMs = 12000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('Provider timeout'), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(url, init, timeoutMs) {
  const response = await timedFetch(url, init, timeoutMs)
  if (!response.ok) throw new Error(`request failed (${response.status})`)
  return response.json()
}

const orientationFor = (value) => ['landscape', 'portrait', 'square'].includes(value) ? value : undefined
const pageFor = (value) => Math.max(1, Math.min(50, Number(value) || 1))

function pexelsLicense(creator) {
  return {
    name: 'Pexels license',
    url: 'https://www.pexels.com/license/',
    attributionRequired: false,
    attributionText: creator ? `Media by ${creator} on Pexels` : undefined,
  }
}

async function searchPexels(input, env) {
  if (!env.PEXELS_API_KEY) throw new Error('not configured on this deployment')
  const candidates = []
  const orientation = orientationFor(input.orientation)
  const page = pageFor(input.page)
  const headers = { Authorization: env.PEXELS_API_KEY }
  if (input.kind !== 'video') {
    const url = new URL('https://api.pexels.com/v1/search')
    url.search = new URLSearchParams({ query: input.query, per_page: input.kind === 'all' ? '10' : '24', page: String(page), ...(orientation ? { orientation } : {}) }).toString()
    const data = await fetchJson(url, { headers })
    for (const photo of data.photos || []) {
      candidates.push({
        id: String(photo.id), provider: 'pexels', kind: 'image', title: photo.alt || input.query,
        thumbnailUrl: photo.src?.medium || photo.src?.small || '', previewUrl: photo.src?.large || photo.src?.medium || '',
        downloadUrl: photo.src?.original || photo.src?.large2x || photo.src?.large, landingPageUrl: photo.url,
        width: photo.width, height: photo.height, creator: photo.photographer, creatorUrl: photo.photographer_url,
        license: pexelsLicense(photo.photographer), compatibility: 'ready',
      })
    }
  }
  if (input.kind !== 'image') {
    const url = new URL('https://api.pexels.com/videos/search')
    url.search = new URLSearchParams({ query: input.query, per_page: input.kind === 'all' ? '10' : '24', page: String(page), ...(orientation ? { orientation } : {}) }).toString()
    const data = await fetchJson(url, { headers })
    for (const video of data.videos || []) {
      const files = (video.video_files || []).filter((file) => file.file_type === 'video/mp4' && file.link).sort((a, b) => (b.width || 0) - (a.width || 0))
      const download = files.find((file) => (file.width || 0) <= 1920) || files[0]
      const preview = [...files].reverse().find((file) => (file.width || 0) >= 640) || download
      if (!download) continue
      candidates.push({
        id: String(video.id), provider: 'pexels', kind: 'video', title: video.user?.name ? `Video by ${video.user.name}` : input.query,
        thumbnailUrl: video.image || '', previewUrl: preview?.link || download.link, downloadUrl: download.link,
        landingPageUrl: video.url, width: download.width, height: download.height, durationSec: video.duration,
        creator: video.user?.name, creatorUrl: video.user?.url, license: pexelsLicense(video.user?.name), compatibility: 'ready',
      })
    }
  }
  return candidates
}

function pixabayLicense(creator) {
  return {
    name: 'Pixabay Content License',
    url: 'https://pixabay.com/service/license-summary/',
    attributionRequired: false,
    attributionText: creator ? `Media by ${creator} on Pixabay` : undefined,
  }
}

async function searchPixabay(input, env) {
  if (!env.PIXABAY_API_KEY) throw new Error('not configured on this deployment')
  const candidates = []
  const page = pageFor(input.page)
  const orientation = orientationFor(input.orientation)
  if (input.kind !== 'video') {
    const url = new URL('https://pixabay.com/api/')
    url.search = new URLSearchParams({ key: env.PIXABAY_API_KEY, q: input.query, per_page: input.kind === 'all' ? '10' : '24', page: String(page), safesearch: 'true', image_type: 'photo', ...(orientation && orientation !== 'square' ? { orientation } : {}) }).toString()
    const data = await fetchJson(url)
    for (const hit of data.hits || []) candidates.push({
      id: String(hit.id), provider: 'pixabay', kind: 'image', title: hit.tags || input.query,
      thumbnailUrl: hit.webformatURL || hit.previewURL || '', previewUrl: hit.webformatURL || '', downloadUrl: hit.largeImageURL || hit.webformatURL,
      landingPageUrl: hit.pageURL, width: hit.imageWidth, height: hit.imageHeight, fileSizeBytes: hit.imageSize,
      creator: hit.user, creatorUrl: hit.user_id ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/` : undefined,
      license: pixabayLicense(hit.user), compatibility: 'ready',
    })
  }
  if (input.kind !== 'image') {
    const url = new URL('https://pixabay.com/api/videos/')
    url.search = new URLSearchParams({ key: env.PIXABAY_API_KEY, q: input.query, per_page: input.kind === 'all' ? '10' : '24', page: String(page), safesearch: 'true' }).toString()
    const data = await fetchJson(url)
    for (const hit of data.hits || []) {
      const rendition = [hit.videos?.large, hit.videos?.medium, hit.videos?.small, hit.videos?.tiny].find((candidate) => candidate?.url)
      const preview = [hit.videos?.tiny, hit.videos?.small, hit.videos?.medium, rendition].find((candidate) => candidate?.url)
      if (!rendition?.url) continue
      candidates.push({
        id: String(hit.id), provider: 'pixabay', kind: 'video', title: hit.tags || input.query,
        thumbnailUrl: preview?.thumbnail || rendition.thumbnail || '', previewUrl: preview?.url || rendition.url, downloadUrl: rendition.url,
        landingPageUrl: hit.pageURL, width: rendition.width, height: rendition.height, durationSec: hit.duration, fileSizeBytes: rendition.size,
        creator: hit.user, creatorUrl: hit.user_id ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/` : undefined,
        license: pixabayLicense(hit.user), compatibility: 'ready',
      })
    }
  }
  return candidates
}

async function searchArchive(input) {
  const url = new URL('https://archive.org/advancedsearch.php')
  const mediaClause = input.kind === 'image' ? 'mediatype:image' : input.kind === 'video' ? 'mediatype:movies' : '(mediatype:movies OR mediatype:image)'
  url.search = new URLSearchParams({ q: `(${input.query}) AND ${mediaClause}`, 'fl[]': ['identifier', 'title', 'creator', 'mediatype', 'licenseurl'], rows: '24', page: String(pageFor(input.page)), output: 'json' }).toString()
  url.searchParams.append('sort[]', 'downloads desc')
  const data = await fetchJson(url)
  return (data.response?.docs || []).map((doc) => ({
    id: doc.identifier, provider: 'archive_org', kind: doc.mediatype === 'image' ? 'image' : 'video',
    title: doc.title || doc.identifier, thumbnailUrl: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`,
    previewUrl: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`, landingPageUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
    creator: Array.isArray(doc.creator) ? doc.creator.join(', ') : doc.creator,
    license: doc.licenseurl ? { name: 'Declared on Archive.org', url: Array.isArray(doc.licenseurl) ? doc.licenseurl[0] : doc.licenseurl, attributionRequired: true, warning: 'Review the item page because Archive.org hosts material under varied licenses.' } : { name: 'Unknown — verify before publishing', attributionRequired: true, warning: 'No machine-readable license was declared for this item.' },
    compatibility: 'resolve',
  }))
}

async function searchNasa(input) {
  const url = new URL('https://images-api.nasa.gov/search')
  url.search = new URLSearchParams({ q: input.query, page: String(pageFor(input.page)), ...(input.kind === 'all' ? {} : { media_type: input.kind }) }).toString()
  const data = await fetchJson(url)
  return (data.collection?.items || []).slice(0, 24).flatMap((item) => {
    const meta = item.data?.[0]
    if (!meta?.nasa_id || !['image', 'video'].includes(meta.media_type)) return []
    const preview = item.links?.find((link) => link.render === 'image')?.href || ''
    return [{
      id: meta.nasa_id, provider: 'nasa', kind: meta.media_type, title: meta.title || meta.nasa_id,
      thumbnailUrl: preview, previewUrl: preview, downloadUrl: meta.media_type === 'image' ? preview : undefined,
      landingPageUrl: `https://images.nasa.gov/details/${encodeURIComponent(meta.nasa_id)}`, creator: meta.photographer || meta.center,
      license: { name: 'NASA media usage guidelines', url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/', attributionRequired: false, warning: 'NASA imagery is generally available for informational use, but logos, identifiable people, endorsement, and third-party material require extra review.' },
      compatibility: meta.media_type === 'image' ? 'ready' : 'resolve',
    }]
  })
}

const metaValue = (metadata, key) => metadata?.[key]?.value?.replace(/<[^>]+>/g, '').trim()

async function searchWikimedia(input) {
  const url = new URL('https://commons.wikimedia.org/w/api.php')
  url.search = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: input.query, gsrnamespace: '6', gsrlimit: '24', gsroffset: String((pageFor(input.page) - 1) * 24), prop: 'imageinfo', iiprop: 'url|size|mime|mediatype|extmetadata', iiurlwidth: '960', format: 'json', origin: '*' }).toString()
  const data = await fetchJson(url)
  return Object.values(data.query?.pages || {}).flatMap((page) => {
    const info = page.imageinfo?.[0]
    const mime = info?.mime || ''
    const kind = mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : null
    if (!kind || (input.kind !== 'all' && input.kind !== kind)) return []
    const licenseName = metaValue(info.extmetadata, 'LicenseShortName') || 'Unknown — verify before publishing'
    const publicDomain = /public domain|cc0/i.test(licenseName)
    const shareAlike = /by-sa|share alike/i.test(licenseName)
    const artist = metaValue(info.extmetadata, 'Artist') || metaValue(info.extmetadata, 'Credit')
    const attribution = metaValue(info.extmetadata, 'Attribution')
    return [{
      id: String(page.pageid), provider: 'wikimedia', kind, title: page.title?.replace(/^File:/, '') || input.query,
      thumbnailUrl: info.thumburl || info.url || '', previewUrl: info.thumburl || info.url || '', downloadUrl: info.url,
      landingPageUrl: info.descriptionurl || `https://commons.wikimedia.org/?curid=${page.pageid}`,
      width: info.width, height: info.height, fileSizeBytes: info.size, creator: artist,
      license: { name: licenseName, url: metaValue(info.extmetadata, 'LicenseUrl'), attributionRequired: !publicDomain, attributionText: attribution || (artist ? `${page.title} — ${artist}` : undefined), shareAlike },
      compatibility: kind === 'video' && !/webm/i.test(mime) ? 'unsupported' : 'ready',
    }]
  })
}

const searchers = {
  pexels: searchPexels,
  pixabay: searchPixabay,
  archive_org: searchArchive,
  nasa: searchNasa,
  wikimedia: searchWikimedia,
}

async function mediaSearch(request, env) {
  const actor = actorFor(request)
  enforceRateLimit(actor, 'media-search', 60, 60_000)
  const input = await request.json()
  const query = String(input.query || '').trim().slice(0, 180)
  if (!query) return errorResponse('A search query is required.')
  const selected = (Array.isArray(input.providers) ? input.providers : PROVIDERS).filter((provider) => PROVIDERS.includes(provider))
  if (!selected.length) return errorResponse('Choose at least one media provider.')
  const normalized = { query, providers: selected, kind: ['image', 'video'].includes(input.kind) ? input.kind : 'all', orientation: input.orientation || 'any', page: pageFor(input.page) }
  const cache = caches.default
  const cacheKey = new Request(`https://rhymx-search-cache.invalid/?v=2&request=${encodeURIComponent(JSON.stringify(normalized))}`)
  const cached = await cache.match(cacheKey)
  if (cached) return cached
  const started = Date.now()
  const settled = await Promise.all(selected.map(async (provider) => {
    try {
      return { provider, candidates: await searchers[provider](normalized, env) }
    } catch (error) {
      return { provider, error: error instanceof Error ? error.message : String(error), candidates: [] }
    }
  }))
  const body = {
    candidates: settled.flatMap((result) => result.candidates).filter((candidate) => candidate.compatibility !== 'unsupported'),
    errors: settled.filter((result) => result.error).map((result) => ({ provider: result.provider, message: result.error })),
    nextPage: normalized.page + 1,
  }
  console.log(JSON.stringify({ event: 'media_search', providers: selected, candidateCount: body.candidates.length, errorCount: body.errors.length, durationMs: Date.now() - started }))
  const ttl = selected.length === 1 && selected[0] === 'pixabay' ? 86400 : 3600
  const response = json(body, 200, { 'Cache-Control': `public, max-age=${ttl}` })
  request.ctx?.waitUntil?.(cache.put(cacheKey, response.clone()))
  try { await cache.put(cacheKey, response.clone()) } catch { /* cache is best effort */ }
  return response
}

async function resolveArchive(candidate) {
  const metadata = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(candidate.id)}`)
  const files = (metadata.files || []).filter((file) => file.name && Number(file.size || 0) <= 500 * 1024 * 1024)
  const compatible = candidate.kind === 'video'
    ? files.filter((file) => /\.mp4$/i.test(file.name) && !/thumb|sample/i.test(file.name)).sort((a, b) => Number(a.size || 0) - Number(b.size || 0))
    : files.filter((file) => /\.(jpe?g|png|webp)$/i.test(file.name) && !/thumb/i.test(file.name)).sort((a, b) => Number(b.size || 0) - Number(a.size || 0))
  const file = compatible[0]
  if (!file) throw new Error('No browser-compatible rendition was found within the project size limit.')
  const downloadUrl = `https://archive.org/download/${encodeURIComponent(candidate.id)}/${file.name.split('/').map(encodeURIComponent).join('/')}`
  return { ...candidate, downloadUrl, previewUrl: candidate.kind === 'video' ? downloadUrl : candidate.previewUrl, fileSizeBytes: Number(file.size || 0), compatibility: 'ready' }
}

async function resolveNasa(candidate) {
  if (candidate.kind === 'image' && candidate.downloadUrl) return candidate
  const manifest = await fetchJson(`https://images-api.nasa.gov/asset/${encodeURIComponent(candidate.id)}`)
  const links = (manifest.collection?.items || []).map((item) => item.href).filter(Boolean)
  const downloadUrl = links.find((link) => /~orig\.(mp4|webm)$/i.test(link)) || links.find((link) => /\.(mp4|webm)$/i.test(link)) || links.find((link) => /\.(jpe?g|png)$/i.test(link))
  if (!downloadUrl) throw new Error('NASA did not return a browser-compatible rendition for this asset.')
  return { ...candidate, downloadUrl, previewUrl: candidate.kind === 'video' ? downloadUrl : candidate.previewUrl, compatibility: 'ready' }
}

const allowedHosts = {
  pexels: (host) => host === 'images.pexels.com' || host === 'videos.pexels.com',
  pixabay: (host) => host.endsWith('.pixabay.com') || host === 'pixabay.com' || host.endsWith('.vimeocdn.com'),
  archive_org: (host) => host === 'archive.org' || host.endsWith('.archive.org'),
  nasa: (host) => host.endsWith('.nasa.gov') || host === 'nasa.gov',
  wikimedia: (host) => host === 'upload.wikimedia.org',
}

function validateCandidate(candidate) {
  if (!candidate || !PROVIDERS.includes(candidate.provider) || !candidate.id || !['image', 'video'].includes(candidate.kind)) throw new Error('Invalid media candidate.')
  return candidate
}

async function resolveCandidate(candidate) {
  validateCandidate(candidate)
  const resolved = candidate.provider === 'archive_org' ? await resolveArchive(candidate) : candidate.provider === 'nasa' ? await resolveNasa(candidate) : candidate
  const target = new URL(resolved.downloadUrl || resolved.previewUrl)
  if (target.protocol !== 'https:' || !allowedHosts[resolved.provider](target.hostname.toLowerCase())) throw new Error('The resolved media host is not approved for this provider.')
  return resolved
}

async function mediaResolve(request) {
  try {
    const { candidate } = await request.json()
    return json(await resolveCandidate(candidate))
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error), 422)
  }
}

async function mediaRelay(request) {
  const actor = actorFor(request)
  enforceRateLimit(actor, 'media-relay', 30, 60_000)
  try {
    const { candidate } = await request.json()
    const resolved = await resolveCandidate(candidate)
    const upstream = await timedFetch(resolved.downloadUrl || resolved.previewUrl, {}, 30_000)
    if (!upstream.ok || !upstream.body) return errorResponse(`Provider download failed (${upstream.status}).`, 502)
    const declared = Number(upstream.headers.get('Content-Length') || 0)
    const maximum = 500 * 1024 * 1024
    if (declared > maximum) return errorResponse('This rendition exceeds the 500 MB project limit.', 413)
    let received = 0
    const limiter = new TransformStream({ transform(chunk, controller) { received += chunk.byteLength; if (received > maximum) controller.error(new Error('Media exceeded the project size limit.')); else controller.enqueue(chunk) } })
    const headers = new Headers()
    headers.set('Content-Type', upstream.headers.get('Content-Type') || (resolved.kind === 'video' ? 'video/mp4' : 'image/jpeg'))
    if (declared) headers.set('Content-Length', String(declared))
    headers.set('Cache-Control', 'private, no-store')
    return new Response(upstream.body.pipeThrough(limiter), { headers })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : String(error), 422)
  }
}

async function transcribe(request, env) {
  const actor = actorFor(request)
  enforceRateLimit(actor, 'transcriptions', 10, 60 * 60_000)
  if (!env.GROQ_API_KEY) return errorResponse('Groq transcription is not configured on this deployment.', 503)
  const incoming = await request.formData()
  const file = incoming.get('file')
  if (!(file instanceof File)) return errorResponse('Attach a voiceover file.')
  if (file.size > 100 * 1024 * 1024) return errorResponse('Voiceover files must be 100 MB or smaller.', 413)
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('model', 'whisper-large-v3-turbo')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  form.append('timestamp_granularities[]', 'segment')
  try {
    const response = await timedFetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: form }, 120_000)
    if (!response.ok) return errorResponse(`Groq transcription failed (${response.status}).`, response.status >= 500 ? 502 : 422)
    console.log(JSON.stringify({ event: 'transcription', status: 'succeeded', bytes: file.size }))
    return new Response(response.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Transcription failed.', 502)
  }
}

async function keywords(request, env) {
  const actor = actorFor(request)
  enforceRateLimit(actor, 'keywords', 30, 60_000)
  if (!env.GROQ_API_KEY) return errorResponse('Groq scene intelligence is not configured on this deployment.', 503)
  const body = await request.json()
  const scenes = Array.isArray(body.scenes) ? body.scenes.slice(0, 200).map((scene) => String(scene).slice(0, 1500)) : []
  if (!scenes.length) return errorResponse('Provide at least one transcript scene.')
  const prompt = `Return JSON with two arrays: {"keywords":[["two or three concrete visual search phrases"]],"treatments":["media" or "motion"]}. Keep exactly one entry per scene. Prefer motion only for statistics, quotations, abstract transitions, titles, or calls to action. Scenes: ${JSON.stringify(scenes)}`
  const response = await timedFetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'llama-3.1-8b-instant', temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }) }, 30_000)
  if (!response.ok) return errorResponse(`Groq keyword generation failed (${response.status}).`, 502)
  const result = await response.json()
  try {
    return json(JSON.parse(result.choices?.[0]?.message?.content || '{}'))
  } catch {
    return errorResponse('Groq returned an invalid scene plan.', 502)
  }
}

async function motionProxy(request, env, pathname) {
  if (!env.MOTION_RENDER_URL) return errorResponse('The isolated HyperFrames render worker is not configured. Editable advanced templates still preview and export through the browser composition.', 503)
  const base = new URL(env.MOTION_RENDER_URL)
  const suffix = pathname.replace(/^\/api\/motion/, '')
  const target = new URL(suffix, base)
  const headers = new Headers(request.headers)
  headers.delete('Cookie')
  if (env.MOTION_RENDER_TOKEN) headers.set('Authorization', `Bearer ${env.MOTION_RENDER_TOKEN}`)
  return timedFetch(target, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body }, 120_000)
}

async function assetResponse(request, env) {
  let response = await env.ASSETS.fetch(request)
  if (response.status === 404 && request.method === 'GET') response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request))
  if (response.headers.get('Content-Type')?.includes('text/html')) {
    const html = (await response.text()).replaceAll('__RHYMX_ORIGIN__', new URL(request.url).origin)
    const headers = new Headers(response.headers)
    headers.set('Content-Type', 'text/html; charset=utf-8')
    headers.set('Cache-Control', 'no-cache')
    return new Response(html, { status: response.status, headers })
  }
  return response
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/api/providers' && request.method === 'GET') return json({ actor: actorFor(request), providers: [
        { id: 'pexels', available: Boolean(env.PEXELS_API_KEY), credential: 'managed' },
        { id: 'pixabay', available: Boolean(env.PIXABAY_API_KEY), credential: 'managed' },
        { id: 'archive_org', available: true, credential: 'keyless' },
        { id: 'nasa', available: true, credential: 'keyless' },
        { id: 'wikimedia', available: true, credential: 'keyless' },
      ] })
      if (url.pathname === '/api/media/search' && request.method === 'POST') return mediaSearch(request, env)
      if (url.pathname === '/api/media/resolve' && request.method === 'POST') return mediaResolve(request)
      if (url.pathname === '/api/media/relay' && request.method === 'POST') return mediaRelay(request)
      if (url.pathname === '/api/transcriptions' && request.method === 'POST') return transcribe(request, env)
      if (url.pathname === '/api/keywords' && request.method === 'POST') return keywords(request, env)
      if (url.pathname.startsWith('/api/motion/renders')) return motionProxy(request, env, url.pathname)
      if (url.pathname.startsWith('/api/')) return errorResponse('API route not found.', 404)
      return assetResponse(request, env)
    } catch (error) {
      if (error instanceof Response) return error
      console.log(JSON.stringify({ event: 'api_error', path: url.pathname, message: error instanceof Error ? error.message : String(error) }))
      return errorResponse('Rhymx could not complete this request.', 500)
    }
  },
}
