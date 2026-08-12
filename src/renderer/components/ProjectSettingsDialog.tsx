import React, { useEffect, useState } from 'react'
import { Database, KeyRound, Settings, Trash2, X } from 'lucide-react'
import { AppSettings } from '../../types/editor'
import { useEditorStore } from '../../store/useEditorStore'

export default function ProjectSettingsDialog({
  onClose,
}: {
  onClose: () => void
  onStorageChanged?: () => void
}) {
  const { apiKeys, setApiKeys } = useEditorStore()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    window.rhymx.getAppSettings().then(setSettings)
  }, [])

  const updateKey = (key: 'groq' | 'pexels' | 'youtube', value: string) => {
    setApiKeys({ [key]: value })
    if (key === 'groq') window.rhymx.setGroqKey(value)
    else if (key === 'pexels') window.rhymx.setPexelsKey(value)
    else window.rhymx.setYouTubeKey(value)
  }

  const clearCache = async () => {
    if (
      !window.confirm(
        'Clear temporary render data? Projects and imported media references are kept.'
      )
    ) {
      return
    }
    setBusy('cache')
    setStatus('Clearing cache…')
    try {
      const next = await window.rhymx.clearCache()
      setSettings(next)
      setStatus('Temporary render data cleared. Projects and imported media were not removed.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/75 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto custom-scrollbar rounded-2xl border border-white/10 bg-[#151821] shadow-2xl">
        <div className="sticky top-0 z-10 h-14 flex items-center justify-between px-5 border-b border-white/8 bg-[#151821]">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold">Project settings</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <section>
            <h3 className="text-xs font-medium text-slate-200">Browser storage</h3>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              Project data is stored in IndexedDB. Imported files stay on your device and are
              referenced through browser file handles where supported.
            </p>
            <div className="mt-3 rounded-lg border border-white/8 bg-black/20 p-3 text-[10px] text-slate-400 break-all">
              {settings?.projectsDirectory || 'Loading…'}
            </div>
            <div className="mt-2 flex items-center gap-2 text-[9px] text-emerald-400/80">
              <Database className="h-3.5 w-3.5" />
              Stored locally in this browser profile
            </div>
          </section>

          <section className="border-t border-white/8 pt-5">
            <h3 className="text-xs font-medium text-slate-200">AI scene builder</h3>
            <label className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-black/15 p-3">
              <div>
                <div className="text-[11px] text-slate-300">
                  Auto-fill new scenes with Pexels video
                </div>
                <div className="text-[9px] text-slate-600 mt-1">
                  Uses Groq’s recommended keywords after transcription.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings?.autoStockEnabled ?? true}
                onChange={async (event) =>
                  setSettings(
                    await window.rhymx.setAutoStockEnabled(event.target.checked)
                  )
                }
                className="h-4 w-4 accent-violet-500"
              />
            </label>
          </section>

          <section className="border-t border-white/8 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <KeyRound className="h-3.5 w-3.5 text-slate-500" />
              <h3 className="text-xs font-medium text-slate-200">API keys</h3>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {(
                [
                  ['groq', 'Groq API key', 'Required for Whisper transcription'],
                  ['pexels', 'Pexels API key', 'Required for automatic stock footage'],
                  ['youtube', 'YouTube Data API key', 'Required only for YouTube search'],
                ] as const
              ).map(([key, label, hint]) => (
                <label key={key} className="text-[10px] text-slate-500">
                  {label}
                  <input
                    type="password"
                    value={apiKeys[key]}
                    onChange={(event) => updateKey(key, event.target.value)}
                    placeholder={hint}
                    className="mt-1.5 w-full h-9 rounded-lg border border-white/10 bg-[#0d0f14] px-3 text-xs text-slate-300 outline-none focus:border-violet-500/50"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="border-t border-white/8 pt-5">
            <h3 className="text-xs font-medium text-slate-200">Cache</h3>
            <p className="mt-1 text-[10px] text-slate-500">
              Browser-managed source fallback data · {formatBytes(settings?.cacheSizeBytes || 0)}.
              Projects and imported media references are always kept.
            </p>
            <button
              onClick={clearCache}
              disabled={busy !== null}
              className="mt-3 h-9 px-3 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50 text-red-300 flex items-center gap-2 text-[10px]"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {busy === 'cache' ? 'Clearing…' : 'Clear cache'}
            </button>
          </section>

          {status && (
            <div className="rounded-lg border border-white/8 bg-black/15 p-3 text-[10px] text-slate-400">
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}
