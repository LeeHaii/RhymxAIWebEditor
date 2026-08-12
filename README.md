# Rhymx AI Web Editor

Rhymx turns a voiceover into an editable compilation-video timeline in the browser. It uses Groq Whisper for timestamped transcription, Llama for visual search phrases, Pexels for optional stock matching, Remotion for preview, and `@remotion/web-renderer` for local MP4 rendering with WebCodecs.

## What works

- Browser-first Vite/React application; Electron is not part of the build.
- Voiceover import through the File System Access API with an input fallback.
- IndexedDB project persistence with versioned project migrations.
- Browser-managed local media registry and remembered file handles where supported.
- Groq transcription and visual-keyword generation using user-supplied keys.
- Pexels image/video search and automatic scene matching.
- Wikimedia Commons image search as the open web image source.
- YouTube search and preview. Direct downloading is intentionally not provided in the browser build.
- Existing multi-track timeline, subtitles, local media bin, undo/redo, autosave, and Remotion preview.
- In-browser MP4 export and sequential batch export using WebCodecs.

## Run locally

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

The static web application is written to `dist/`.

## Browser support

Use a current Chromium-based browser for the fullest feature set. Firefox and Safari support depends on their WebCodecs and File System Access implementations. If persistent file handles are unavailable, Rhymx stores imported file blobs in IndexedDB as a compatibility fallback.

API keys are stored only in the current browser profile. This direct-provider mode is convenient for a local-first editor; a hosted multi-user deployment should proxy provider calls through an authenticated backend so secrets are not exposed to browser code.

## Architecture

```text
React editor
  ├─ core/project       versioned project migrations
  ├─ platform/web       IndexedDB, file handles, provider adapters, web export
  ├─ store              editor and timeline state
  ├─ renderer           application UI
  └─ remotion           shared preview/export composition
```

The original desktop main/preload code remains in `src/main` and `src/preload` as migration reference, but TypeScript and Vite exclude it from the canonical web build.

## Current limitations

- YouTube media downloading relied on a native `yt-dlp` sidecar and cannot run safely as a static browser feature. Search and preview remain available; users can import media they are authorized to use.
- Very large fallback file blobs depend on the browser's storage quota. Browsers with persisted file handles avoid duplicating originals.
- Client-side rendering depends on the codecs available through the user's browser and operating system.

Rhymx is under active development. Make sure you have the rights to use imported or third-party media.
