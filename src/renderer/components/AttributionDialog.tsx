import React, { useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Download, ExternalLink, X } from 'lucide-react'
import { useEditorStore } from '../../store/useEditorStore'

const safeFileName = (value: string) => value.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'rhymx-project'

function saveText(name: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export default function AttributionDialog({ onClose }: { onClose: () => void }) {
  const scenes = useEditorStore((state) => state.scenes)
  const projectName = useEditorStore((state) => state.projectName)
  const assets = useMemo(() => {
    const seen = new Set<string>()
    return scenes.flatMap((scene) => {
      const media = scene.media
      if (!media?.provenance || media.provenance.provider === 'local') return []
      const key = `${media.provenance.provider}:${media.provenance.sourceId}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ media, provenance: media.provenance }]
    })
  }, [scenes])

  const rows = assets.map(({ media, provenance }) => ({
    title: media.title,
    provider: provenance.provider,
    creator: provenance.creator || media.creatorName || 'Not listed',
    source: provenance.landingPageUrl || media.providerUrl || '',
    license: provenance.license?.name || 'Unknown — verify before publishing',
    attribution: provenance.license?.attributionText || '',
    required: provenance.license?.attributionRequired ?? true,
    warning: provenance.license?.warning,
    shareAlike: provenance.license?.shareAlike,
  }))

  const exportReport = (format: 'txt' | 'md' | 'json') => {
    const base = safeFileName(projectName)
    if (format === 'json') {
      saveText(`${base}-attribution.json`, JSON.stringify({ project: projectName, assets: rows }, null, 2), 'application/json')
      return
    }
    const text = format === 'md'
      ? `# ${projectName} — media attribution\n\n${rows.map((row) => `## ${row.title}\n\n- Provider: ${row.provider}\n- Creator: ${row.creator}\n- License: ${row.license}\n- Source: ${row.source || 'Not available'}${row.attribution ? `\n- Attribution: ${row.attribution}` : ''}${row.warning ? `\n- Warning: ${row.warning}` : ''}`).join('\n\n')}`
      : `${projectName} — media attribution\n\n${rows.map((row) => `${row.title}\nProvider: ${row.provider}\nCreator: ${row.creator}\nLicense: ${row.license}\nSource: ${row.source || 'Not available'}${row.attribution ? `\nAttribution: ${row.attribution}` : ''}${row.warning ? `\nWarning: ${row.warning}` : ''}`).join('\n\n')}`
    saveText(`${base}-attribution.${format}`, text, 'text/plain')
  }

  const unresolved = rows.filter((row) => row.license.startsWith('Unknown') || row.warning)

  return (
    <div className="fixed inset-0 z-[300] bg-black/75 backdrop-blur-sm flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-labelledby="attribution-title">
      <div className="w-full max-w-4xl max-h-[84vh] rounded-3xl border border-white/10 bg-[#11131a] shadow-2xl flex flex-col overflow-hidden">
        <header className="p-5 border-b border-white/8 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[.22em] text-violet-300">Responsible sourcing</div>
            <h2 id="attribution-title" className="text-xl font-semibold mt-1">Attribution manager</h2>
            <p className="text-xs text-slate-500 mt-1">Every used source stays attached to the project.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-slate-400" aria-label="Close attribution manager"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
          <div className={`rounded-2xl border p-4 flex items-center gap-3 ${unresolved.length ? 'border-amber-500/20 bg-amber-500/10 text-amber-100' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'}`}>
            {unresolved.length ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
            <div className="text-xs">{unresolved.length ? `${unresolved.length} source${unresolved.length === 1 ? '' : 's'} need a license check before publishing.` : rows.length ? 'All used sources include a declared license record.' : 'No sourced media is used in this project yet.'}</div>
          </div>
          <div className="mt-4 space-y-3">
            {rows.map((row, index) => (
              <article key={`${row.provider}:${row.title}:${index}`} className="rounded-2xl border border-white/8 bg-white/[.025] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{row.title}</div>
                    <div className="text-[10px] text-slate-500 mt-1 capitalize">{row.provider.replace('_', '.')} · {row.creator}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] ${row.license.startsWith('Unknown') ? 'bg-amber-500/10 text-amber-200' : row.shareAlike ? 'bg-sky-500/10 text-sky-200' : 'bg-emerald-500/10 text-emerald-200'}`}>{row.license}</span>
                </div>
                {row.attribution && <p className="text-[11px] text-slate-400 mt-3">{row.attribution}</p>}
                {row.warning && <p className="text-[10px] text-amber-300 mt-2">{row.warning}</p>}
                {row.source && <a href={row.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-3 text-[10px] text-violet-300 hover:text-violet-200">Open original source <ExternalLink className="h-3 w-3" /></a>}
              </article>
            ))}
          </div>
        </div>
        <footer className="p-4 border-t border-white/8 flex flex-wrap justify-end gap-2">
          {(['txt', 'md', 'json'] as const).map((format) => <button key={format} onClick={() => exportReport(format)} className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-[10px] flex items-center gap-1.5"><Download className="h-3.5 w-3.5" />{format.toUpperCase()}</button>)}
        </footer>
      </div>
    </div>
  )
}
