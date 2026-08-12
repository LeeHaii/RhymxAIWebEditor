# Rhymx AI Web Editor

Rhymx turns a voiceover into an editable compilation-video timeline in the
browser. It uses user-supplied Groq, Pexels, and YouTube credentials, Remotion
for the main timeline, and a loopback-only HyperFrames companion for advanced
motion scenes.

## What works

- Browser-first Vite/React application; Electron is not part of the build.
- Voiceover import through the File System Access API with an input fallback.
- IndexedDB project persistence with versioned project migrations.
- Browser-managed local media registry and remembered file handles where supported.
- Groq transcription and visual-keyword generation directly from the browser.
- Pexels image/video search and automatic scene matching.
- Wikimedia Commons image search as a keyless source.
- YouTube search and preview. Direct downloading is intentionally unavailable in the browser build.
- Revealable, testable API-key controls with remembered-device and session-only storage modes.
- Multi-track timeline, subtitles, local media bin, undo/redo, autosave, and Remotion preview.
- Real local HyperFrames rendering for advanced templates, deterministic asset caching, cancellation, and rerendering after edits.
- In-browser MP4 export and sequential batch export using WebCodecs.

## Local requirements

- Node.js 22.12 or newer (`.nvmrc` is included).
- FFmpeg and FFprobe available on `PATH`.
- A current Chromium-based browser.

Install packages and confirm the motion toolchain:

```bash
npm install
npm run doctor:motion
```

## Run locally

Start the browser app and local HyperFrames companion together:

```bash
npm run dev:local
```

Or run them in separate terminals:

```bash
npm run dev:web
npm run dev:motion
```

The editor is served by Vite. The motion companion listens only on
`http://127.0.0.1:43127`, accepts the configured localhost Vite and preview
origins, and issues a per-launch session token.

Create the static application build with:

```bash
npm run build
```

The static application is written to `dist/`. A static deployment cannot start
the local companion on a visitor's machine, so advanced scenes use the labelled
Remotion fallback unless the visitor starts the companion themselves.

## API-key behavior

API keys never enter project data, URLs, logs, or rendered output. With
**Remember on this device** enabled, they are stored in local storage for the
current browser origin. With it disabled, they use session storage and disappear
when the browser session ends.

Both storage modes are readable by code running on the same origin. This BYOK
branch should therefore be opened only from a trusted local build. Provider
requests send a key only to the provider being invoked.

- Groq: transcription and visual-keyword generation.
- Pexels: image/video search and local stock matching.
- YouTube Data API: YouTube search.
- Wikimedia: keyless image search.

The hosted worker can still provide the broader Pixabay, Archive.org, and NASA
search adapters when deployed.

## HyperFrames workflow

An advanced scene keeps its template ID, version, values, color, and timing as
the editable source of truth. The local companion turns that manifest into a
self-contained HTML/GSAP composition, renders it with HyperFrames, and encodes
an MP4 with FFmpeg. The MP4 is then saved into the browser asset database and
used by the main Remotion timeline.

The deterministic cache key includes:

- Template ID and version.
- Field values and accent color.
- Duration, frame rate, width, and height.

Changing any of those inputs invalidates the generated asset. Export regenerates
missing or stale motion at the selected output resolution. If the companion is
offline, the editor displays a labelled fallback preview and the export dialog
lets the user explicitly continue with that fallback.

The local service exposes:

```text
GET    /health
GET    /session
POST   /renders
GET    /renders/:id
GET    /renders/:id/output
DELETE /renders/:id
```

Render requests are validated, limited to known templates, queued with bounded
concurrency, cancellable, and protected by origin checks plus a per-launch token.
Temporary composition directories are removed after each render. Persistent
render cache files live under `.cache/rhymx-motion/`, which is ignored by Git.

## Architecture

```text
React editor
  |-- core/project       versioned project migrations
  |-- platform/web       IndexedDB, file handles, BYOK provider adapters
  |-- motion             editable manifests and cached generated assets
  |-- store              editor and timeline state
  |-- renderer           application UI
  `-- remotion           shared timeline preview/export composition

127.0.0.1 motion companion
  |-- request validation and deterministic cache
  |-- self-contained HTML/GSAP composition
  |-- HyperFrames frame capture
  `-- FFmpeg MP4 encoding
```

The original desktop main/preload code remains in `src/main` and `src/preload`
as migration reference, but TypeScript and Vite exclude it from the canonical
web build.

## Browser support

Current Chromium-based browsers provide the fullest File System Access and
WebCodecs support. Firefox and Safari support depends on their WebCodecs and file
API implementations. If persistent file handles are unavailable, Rhymx stores
imported file blobs in IndexedDB as a compatibility fallback.

## Current limitations

- YouTube media downloading relied on a native `yt-dlp` sidecar and cannot run safely as a static browser feature. Search and preview remain available; users can import media they are authorized to use.
- Real HyperFrames output requires the local Node/Chromium/FFmpeg companion.
- Very large fallback file blobs depend on the browser's storage quota.
- Client-side final rendering depends on codecs available through the browser and operating system.

Rhymx is under active development. Make sure you have the rights to use imported
or third-party media.
