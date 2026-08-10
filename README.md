# Rhymx AI Video Editor

**AI-powered desktop video editor for turning voiceovers into compilation-style videos.**

Rhymx analyzes a voiceover, generates timestamped scenes and subtitles, creates relevant visual search keywords, and can automatically match stock footage to each scene. From there, you can refine everything in a timeline-based editor and export the finished video up to 4K.

> 🚧 Rhymx is currently under active development.

## ✨ Features

### 🤖 AI-Powered Editing

* Transcribes voiceovers with **Groq Whisper**
* Generates word-level timestamps and synchronized subtitles
* Automatically breaks narration into editable scenes
* Uses **Llama 3.1** to generate relevant visual search phrases
* Automatically finds matching **Pexels stock footage**
* Falls back to manual media selection when no suitable stock clip is found

### 🎬 Timeline Editor

* Scene-based video timeline
* Split scenes directly at the playhead
* Trim and reposition clips
* Timeline snapping
* Adjustable timeline zoom
* Multiple video tracks
* Subtitle track
* Voiceover track
* Music and sound-effect clips
* Mute/show individual tracks
* Undo and redo support

### 🔎 Built-In Media Search

Search for visuals without leaving the editor:

* DuckDuckGo Images
* Pexels Images
* Pexels Videos
* YouTube

AI-generated search phrases are automatically attached to scenes to make finding relevant footage faster.

### ▶️ YouTube Clip Workflow

* Search YouTube from the scene inspector
* Preview videos inside the editor
* Choose exact start/end timestamps
* Download only the required portion
* Save downloaded clips to the project's media library
* Assign clips directly to scenes

### 🖼️ Media Library

Import and organize:

* Videos
* Images
* Music
* Sound effects
* Downloaded YouTube clips

Media can be reused throughout a project and assigned directly to selected scenes.

### 💬 Subtitles

Rhymx generates synchronized subtitles from the original voiceover and lets you edit them alongside the video.

Subtitle timing remains separate from visual scene timing, allowing visuals to be adjusted without losing the original transcription timing.

### 💾 Project Management

* Create and reopen projects
* Automatic project saving
* Persistent media library
* Remembered editor layout
* Resizable media bin, preview, inspector, and timeline
* Undo / redo history

### 🚀 Video Export

Export finished projects as MP4 at:

| Preset  | Resolution |
| ------- | ---------- |
| HD      | 1280×720   |
| Full HD | 1920×1080  |
| QHD     | 2560×1440  |
| 4K      | 3840×2160  |

Rhymx supports:

* Configurable video bitrate
* CPU H.264 encoding
* NVIDIA NVENC hardware encoding when supported
* Hardware capability detection
* Export progress tracking
* Export cancellation
* Batch rendering multiple projects

## 🧠 How It Works

```text
Voiceover
    │
    ▼
Groq Whisper
    │
    ├── Timestamped transcription
    ├── Subtitle timing
    └── Scene segmentation
             │
             ▼
       Llama 3.1
             │
             ▼
    Visual search keywords
             │
             ▼
       Pexels Search
             │
             ▼
   Automatic stock matching
             │
             ▼
       Rhymx Timeline
             │
     ┌───────┼────────┐
     ▼       ▼        ▼
   Video  Subtitles  Audio
     │       │        │
     └───────┼────────┘
             ▼
        Remotion
             │
             ▼
         MP4 Export
```

## 🛠️ Tech Stack

| Technology               | Purpose                             |
| ------------------------ | ----------------------------------- |
| Electron                 | Desktop application                 |
| React                    | User interface                      |
| TypeScript               | Application code                    |
| Vite                     | Development and bundling            |
| Tailwind CSS             | Styling                             |
| Zustand                  | Editor state management             |
| Remotion                 | Video preview and rendering         |
| Groq API                 | AI transcription and scene analysis |
| Whisper Large V3 / Turbo | Speech-to-text                      |
| Llama 3.1 8B Instant     | Visual keyword generation           |
| Pexels API               | Stock image/video search            |
| YouTube Data API         | YouTube search                      |
| yt-dlp                   | YouTube media downloading           |
| FFmpeg                   | Media processing and encoding       |

## 📋 Requirements

Before running Rhymx, make sure you have:

* Node.js
* npm
* A Groq API key
* A Pexels API key if you want automatic stock footage
* A YouTube API key if you want YouTube search

The current build configuration is primarily targeted at **Windows x64**.

## 🔑 API Keys

### Groq

A **Groq API key is required** when creating a project from a voiceover.

Rhymx currently uses Groq for:

* Whisper-based transcription
* Timestamp generation
* Transcription accuracy recovery
* Visual search keyword generation

The project uses:

```text
whisper-large-v3-turbo
whisper-large-v3
llama-3.1-8b-instant
```

### Pexels

A Pexels API key is optional unless **Automatically add Pexels stock video** is enabled.

It is used for:

* Automatic stock footage matching
* Manual Pexels image search
* Manual Pexels video search

### YouTube

A YouTube API key enables YouTube search inside the editor.

Downloaded clips are processed locally and stored with the project.

## 📦 Installation

Clone the repository:

```bash
git clone https://github.com/LeeHaii/RhymxAIVideoEditor.git
cd RhymxAIVideoEditor
```

Install dependencies:

```bash
npm install
```

Start the development environment:

```bash
npm run dev
```

## 🏗️ Building

Create a production build with:

```bash
npm run build
```

The build pipeline:

1. Compiles TypeScript
2. Builds the Vite renderer
3. Bundles the Remotion composition
4. Packages the desktop application with Electron Builder

Production output is written to:

```text
release/
```

## 🎙️ Creating Your First Video

### 1. Create a project

Open Rhymx and select **New Project**.

### 2. Add a voiceover

Choose or drag in a supported audio file.

Supported voiceover formats include:

```text
MP3
WAV
M4A
AAC
FLAC
OGG
OPUS
WEBM
```

### 3. Add your Groq API key

Rhymx needs Groq to transcribe the voiceover and generate scene information.

### 4. Enable automatic footage

Optionally enable automatic Pexels footage and enter your Pexels API key.

### 5. Let Rhymx analyze the narration

Rhymx will:

```text
Transcribe audio
      ↓
Generate timestamps
      ↓
Create scenes
      ↓
Generate visual keywords
      ↓
Search for stock footage
      ↓
Build the initial timeline
```

### 6. Edit

Use the editor to:

* Replace AI-selected footage
* Search for additional media
* Add local media
* Download YouTube clips
* Split scenes
* Edit subtitles
* Add music and SFX
* Adjust clip timing
* Preview the result

### 7. Export

Choose your resolution, bitrate, and encoder, then render the project to MP4.

## ⌨️ Keyboard Shortcuts

| Shortcut                  | Action                      |
| ------------------------- | --------------------------- |
| `Space`                   | Play / pause                |
| `Ctrl + B`                | Split selected scene        |
| `Delete` / `Backspace`    | Delete selected item        |
| `Ctrl + Z`                | Undo                        |
| `Ctrl + Shift + Z`        | Redo                        |
| `Ctrl + Y`                | Redo                        |
| `Ctrl + S`                | Save project                |
| `Ctrl + +`                | Zoom timeline in            |
| `Ctrl + -`                | Zoom timeline out           |
| `Ctrl + 0`                | Reset timeline zoom         |
| `←` / `→`                 | Move playhead by one frame  |
| `Shift + ←` / `Shift + →` | Move playhead by one second |

On macOS-style keyboards, supported command shortcuts also respond to `Cmd` where applicable.

## 📁 Project Structure

```text
RhymxAIVideoEditor/
├── resources/
│   └── bin/
│       └── yt-dlp.exe
│
├── src/
│   ├── main/
│   │   ├── services/
│   │   │   ├── export.ts
│   │   │   ├── groq.ts
│   │   │   ├── hardware.ts
│   │   │   ├── imageSearch.ts
│   │   │   ├── mediaMetadata.ts
│   │   │   ├── pexelsAutoMatch.ts
│   │   │   └── ...
│   │   └── main.ts
│   │
│   ├── preload/
│   │
│   ├── remotion/
│   │   ├── Composition.tsx
│   │   ├── Root.tsx
│   │   └── index.ts
│   │
│   ├── renderer/
│   │   ├── components/
│   │   │   ├── Inspector/
│   │   │   ├── Timeline/
│   │   │   ├── BatchExportDialog.tsx
│   │   │   ├── ExportDialog.tsx
│   │   │   ├── MediaBin.tsx
│   │   │   ├── NewProject.tsx
│   │   │   ├── PlayerCanvas.tsx
│   │   │   ├── ProjectHome.tsx
│   │   │   └── TranscribingScreen.tsx
│   │   └── App.tsx
│   │
│   ├── store/
│   │   └── useEditorStore.ts
│   │
│   └── types/
│
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## 🖥️ Rendering

Rhymx uses **Remotion** for the video composition and rendering pipeline.

Two encoding paths are available:

### CPU

Software H.264 encoding is available as the fallback rendering option.

### NVIDIA NVENC

If a compatible NVIDIA GPU is available, Rhymx performs a real encoder probe before enabling NVENC.

This prevents the application from displaying GPU encoding as available when FFmpeg cannot actually initialize the hardware encoder.

## 📚 Batch Export

Multiple saved projects can be rendered sequentially from the batch export interface.

Batch rendering includes:

* Project selection
* Shared output resolution
* Encoder selection
* Output directory selection
* Overall progress
* Per-project progress
* Cancellation
* Completed/failed result tracking

Projects are rendered sequentially to reduce memory and playback instability.

## ⚠️ Current Status

Rhymx is an early-stage project and APIs, project formats, and editor behavior may change.

Some integrations also depend on third-party APIs and their availability, quotas, and terms of service.

When importing or downloading third-party media, make sure you have the appropriate rights to use that content.

## 🗺️ Roadmap

Potential future improvements:

* macOS and Linux packaging
* More hardware encoders
* More stock-media providers
* Additional subtitle presets and animations
* AI-assisted scene restructuring
* Transition effects
* More export formats and aspect ratios
* Proxy media for large projects
* Improved project portability
* Automatic music selection
* Release builds and auto-updates

## 🤝 Contributing

Contributions are welcome.

To contribute:

```bash
git clone https://github.com/LeeHaii/RhymxAIVideoEditor.git
cd RhymxAIVideoEditor
npm install
npm run dev
```

Then:

1. Create a new branch
2. Make your changes
3. Test the editor
4. Commit your changes
5. Open a pull request

Bug reports, feature requests, and improvements are also welcome through GitHub Issues.

## 📄 License

A license file has not been added to the repository yet.

If you intend for Rhymx to be open-source and reusable by others, add an appropriate license such as MIT, Apache-2.0, or GPL-3.0.

---

<p align="center">
  <strong>Rhymx AI Video Editor</strong><br />
  Turn a voiceover into an editable video timeline with AI.
</p>
