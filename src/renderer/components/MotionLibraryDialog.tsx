import React, { useMemo, useState } from 'react'
import { Layers3, Sparkles, X } from 'lucide-react'
import { motionTemplates } from '../../motion/templates'
import { MotionTemplateManifest } from '../../types/editor'
import { useEditorStore } from '../../store/useEditorStore'

export default function MotionLibraryDialog({ onClose }: { onClose: () => void }) {
  const activeSceneId = useEditorStore((state) => state.activeSceneId)
  const assignMediaToScene = useEditorStore((state) => state.assignMediaToScene)
  const updateScene = useEditorStore((state) => state.updateScene)
  const activeScene = useEditorStore((state) =>
    state.scenes.find((scene) => scene.id === state.activeSceneId)
  )
  const [selectedId, setSelectedId] = useState(motionTemplates[0].id)
  const template = useMemo(
    () => motionTemplates.find((item) => item.id === selectedId) || motionTemplates[0],
    [selectedId]
  )
  const [valuesByTemplate, setValuesByTemplate] = useState<Record<string, Record<string, string | number | boolean>>>({})
  const values = valuesByTemplate[template.id] || Object.fromEntries(
    template.fields.map((field) => [field.id, field.defaultValue])
  )

  const updateValue = (fieldId: string, value: string | number | boolean) => {
    setValuesByTemplate((current) => ({
      ...current,
      [template.id]: { ...values, [fieldId]: value },
    }))
  }

  const useTemplate = (manifest: MotionTemplateManifest) => {
    if (!activeSceneId || !activeScene) return
    const nextValues = valuesByTemplate[manifest.id] || Object.fromEntries(
      manifest.fields.map((field) => [field.id, field.defaultValue])
    )
    assignMediaToScene(activeSceneId, {
      id: `motion:${manifest.id}:${crypto.randomUUID()}`,
      type: 'motion_graphic',
      kind: 'video',
      sourceUrl: `rhymx-motion:${manifest.id}`,
      thumbnailUrl: '',
      title: manifest.name,
      motion: {
        templateId: manifest.id,
        templateVersion: manifest.version,
        engine: manifest.engine,
        values: nextValues,
        accentColor: String(nextValues.accent || '#8b5cf6'),
      },
      provenance: {
        provider: 'rhymx',
        sourceId: `${manifest.id}@${manifest.version}`,
        license: {
          name: 'Rhymx motion template',
          attributionRequired: false,
        },
      },
    })
    updateScene(activeSceneId, {
      durationSec: Math.max(activeScene.durationSec, manifest.defaultDurationSec),
      endTimeSec:
        activeScene.startTimeSec + Math.max(activeScene.durationSec, manifest.defaultDurationSec),
      suggestedTreatment: 'motion',
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/75 backdrop-blur-sm flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-labelledby="motion-title">
      <div className="w-full max-w-5xl max-h-[86vh] overflow-hidden rounded-3xl border border-white/10 bg-[#11131a] shadow-2xl flex flex-col">
        <header className="p-5 border-b border-white/8 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-violet-300">Motion library</div>
            <h2 id="motion-title" className="text-xl font-semibold mt-1">Build a scene that moves</h2>
            <p className="text-xs text-slate-500 mt-1">Integrated templates render directly in the timeline. Advanced templates keep an editable HyperFrames-ready manifest.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-slate-400" aria-label="Close motion library"><X className="h-5 w-5" /></button>
        </header>
        <div className="grid md:grid-cols-[1.2fr_.8fr] min-h-0 flex-1">
          <div className="p-5 overflow-y-auto custom-scrollbar grid sm:grid-cols-2 gap-3 content-start">
            {motionTemplates.map((item) => (
              <button key={item.id} onClick={() => setSelectedId(item.id)} className={`rounded-2xl border p-4 text-left transition-colors ${selectedId === item.id ? 'border-violet-400/60 bg-violet-500/10' : 'border-white/8 bg-white/[.025] hover:bg-white/[.05]'}`}>
                <div className="aspect-video rounded-xl mb-3 p-4 flex flex-col justify-end overflow-hidden" style={{ background: item.engine === 'hyperframes' ? 'radial-gradient(circle at 75% 20%, rgba(236,72,153,.45), transparent 38%), #090a12' : 'linear-gradient(135deg, #090a10, rgba(124,58,237,.35))' }}>
                  <div className="text-[8px] uppercase tracking-[.2em] text-violet-200">{item.engine === 'hyperframes' ? 'Advanced motion' : 'Integrated motion'}</div>
                  <div className="font-semibold mt-1">{item.name}</div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-300">{item.category}</span>
                  <span className="text-[9px] text-slate-600">{item.defaultDurationSec}s</span>
                </div>
              </button>
            ))}
          </div>
          <aside className="border-l border-white/8 p-5 overflow-y-auto custom-scrollbar bg-black/10">
            <div className="flex items-center gap-2 mb-5"><Layers3 className="h-4 w-4 text-violet-300" /><h3 className="font-medium">{template.name}</h3></div>
            <div className="space-y-4">
              {template.fields.map((field) => (
                <label key={field.id} className="block text-[10px] text-slate-500">
                  {field.label}
                  <input
                    type={field.type === 'color' ? 'color' : field.type === 'number' ? 'number' : 'text'}
                    value={String(values[field.id])}
                    onChange={(event) => updateValue(field.id, field.type === 'number' ? Number(event.target.value) : event.target.value)}
                    className={`${field.type === 'color' ? 'h-10 p-1' : 'px-3'} mt-1.5 w-full rounded-xl border border-white/10 bg-[#090b10] py-2.5 text-xs text-white outline-none focus:border-violet-500/60`}
                  />
                </label>
              ))}
            </div>
            {!activeSceneId && <p className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[10px] text-amber-200">Select a scene on the timeline before adding motion.</p>}
            <button onClick={() => useTemplate(template)} disabled={!activeSceneId} className="mt-6 w-full rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-600 py-3 text-xs font-medium flex items-center justify-center gap-2"><Sparkles className="h-4 w-4" />Use this template</button>
          </aside>
        </div>
      </div>
    </div>
  )
}
