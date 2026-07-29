import React, { useState, useEffect } from 'react'
import { useEditorStore } from '../../../store/useEditorStore'
import { Captions, Crop, Image as ImageIcon, Search, Video, Youtube } from 'lucide-react'

export default function ContextInspector() {
  const {
    scenes,
    activeSceneId,
    assignMediaToScene,
    updateScene,
    apiKeys,
    subtitleSettings,
    updateSubtitleSettings,
  } = useEditorStore()
  const [activeTab, setActiveTab] = useState<'pexels' | 'youtube' | 'images'>('images')
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState(false)
  
  // YouTube Trim Modal State
  const [ytUrl, setYtUrl] = useState('')
  const [ytStart, setYtStart] = useState(0)
  const [ytEnd, setYtEnd] = useState(10)
  const [isTrimming, setIsTrimming] = useState(false)

  const activeScene = scenes.find(s => s.id === activeSceneId)

  // Auto-update search query when scene changes
  useEffect(() => {
    if (activeScene && activeScene.keywords.length > 0) {
      setSearchQuery(activeScene.keywords[0])
    } else {
      setSearchQuery('')
    }
    setResults([])
  }, [activeScene?.id])

  const handleSearch = async () => {
    if (!searchQuery) return
    setIsSearching(true)
    
    try {
      if (activeTab === 'images') {
        const res = await window.electronAPI.searchImages(searchQuery)
        setResults(res)
      } else if (activeTab === 'pexels') {
        if (!apiKeys.pexels) {
          alert('Please set Pexels API key in Settings.')
          return
        }
        // Simple client fetch to Pexels API
        const res = await fetch(`https://api.pexels.com/videos/search?query=${searchQuery}&per_page=10`, {
          headers: { Authorization: apiKeys.pexels }
        }).then(r => r.json())
        setResults(res.videos || [])
      }
      // YouTube search would use a similar API, skipped for demo brevity. We'll rely on direct URL input for YT.
    } catch (err) {
      console.error(err)
    } finally {
      setIsSearching(false)
    }
  }

  const applyImage = (url: string, title: string) => {
    if (!activeSceneId) return
    assignMediaToScene(activeSceneId, {
      id: `img_${Date.now()}`,
      type: 'google_image',
      sourceUrl: url,
      thumbnailUrl: url,
      title: title,
      imageFit: 'cover',
      enableKenBurnsEffect: true
    })
  }

  const applyPexels = (video: any) => {
    if (!activeSceneId) return
    // find best hd file
    const file = video.video_files.find((f: any) => f.quality === 'hd') || video.video_files[0]
    assignMediaToScene(activeSceneId, {
      id: `pex_${video.id}`,
      type: 'pexels_video',
      sourceUrl: file.link,
      thumbnailUrl: video.image,
      title: video.url
    })
  }

  const handleYoutubeTrim = async () => {
    if (!activeSceneId || !ytUrl) return
    setIsTrimming(true)
    try {
      const localPath = await window.electronAPI.trimYouTube(ytUrl, ytStart, ytEnd)
      assignMediaToScene(activeSceneId, {
        id: `yt_${Date.now()}`,
        type: 'youtube_clip',
        sourceUrl: localPath,
        thumbnailUrl: '', // Could fetch YT thumbnail
        title: 'YouTube Clip'
      })
      setYtUrl('')
    } catch (err) {
      alert('Failed to trim YouTube video.')
    } finally {
      setIsTrimming(false)
    }
  }

  if (!activeScene) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 p-8 text-center">
        Select a scene in the timeline to inspect and attach media.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-800">
      <div className="p-4 border-b border-slate-700 bg-slate-900/50">
        <h3 className="font-semibold text-white mb-2">Scene Inspector</h3>
        <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
          Subtitle text
        </label>
        <textarea
          value={activeScene.transcriptText}
          onChange={(event) => updateScene(activeScene.id, { transcriptText: event.target.value })}
          className="w-full h-20 resize-none text-xs text-slate-300 mb-3 bg-[#0c0e13] p-2.5 rounded-lg border border-white/10 focus:border-violet-500/50 outline-none"
        />
        
        <div className="flex flex-wrap gap-2 mb-3">
          {activeScene.keywords.map(kw => (
            <span key={kw} className="text-[10px] bg-indigo-900/50 text-indigo-300 px-2 py-1 rounded border border-indigo-700/50 cursor-pointer hover:bg-indigo-800/50" onClick={() => setSearchQuery(kw)}>
              {kw}
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <input 
            type="text" 
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search media..."
          />
          <button onClick={handleSearch} className="bg-indigo-600 hover:bg-indigo-500 p-2 rounded text-white transition-colors">
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex border-b border-slate-700">
        <button onClick={() => setActiveTab('images')} className={`flex-1 py-3 text-sm flex items-center justify-center gap-2 ${activeTab === 'images' ? 'border-b-2 border-indigo-500 text-indigo-400 bg-slate-800' : 'text-slate-500 hover:bg-slate-700/50 bg-slate-900/20'}`}>
          <ImageIcon className="w-4 h-4" /> Images
        </button>
        <button onClick={() => setActiveTab('pexels')} className={`flex-1 py-3 text-sm flex items-center justify-center gap-2 ${activeTab === 'pexels' ? 'border-b-2 border-indigo-500 text-indigo-400 bg-slate-800' : 'text-slate-500 hover:bg-slate-700/50 bg-slate-900/20'}`}>
          <Video className="w-4 h-4" /> Pexels
        </button>
        <button onClick={() => setActiveTab('youtube')} className={`flex-1 py-3 text-sm flex items-center justify-center gap-2 ${activeTab === 'youtube' ? 'border-b-2 border-indigo-500 text-indigo-400 bg-slate-800' : 'text-slate-500 hover:bg-slate-700/50 bg-slate-900/20'}`}>
          <Youtube className="w-4 h-4" /> YouTube
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {isSearching ? (
          <div className="text-center text-slate-500 mt-10">Searching...</div>
        ) : (
          <div className="space-y-4">
            
            {activeTab === 'images' && results.map(img => (
              <div key={img.id} onClick={() => applyImage(img.sourceUrl, img.title)} className="relative group cursor-pointer rounded-lg overflow-hidden border border-slate-700 hover:border-indigo-500 transition-colors">
                <img src={img.thumbnailUrl} alt={img.title} className="w-full h-40 object-cover" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg">Apply Image</span>
                </div>
              </div>
            ))}

            {activeTab === 'pexels' && results.map(vid => (
              <div key={vid.id} onClick={() => applyPexels(vid)} className="relative group cursor-pointer rounded-lg overflow-hidden border border-slate-700 hover:border-indigo-500 transition-colors">
                <img src={vid.image} alt="Thumbnail" className="w-full h-40 object-cover" />
                {/* Hover Video Preview implementation could go here using video.video_files */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-full shadow-lg">Apply Video</span>
                </div>
              </div>
            ))}

            {activeTab === 'youtube' && (
              <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><Crop className="w-4 h-4 text-indigo-400"/> Trim YouTube URL</h4>
                <input 
                  type="text"
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-sm text-slate-300 mb-3"
                  value={ytUrl}
                  onChange={e => setYtUrl(e.target.value)}
                />
                <div className="flex gap-2 mb-4">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 block mb-1">Start (sec)</label>
                    <input type="number" value={ytStart} onChange={e => setYtStart(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-sm text-white" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 block mb-1">End (sec)</label>
                    <input type="number" value={ytEnd} onChange={e => setYtEnd(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-700 rounded p-1.5 text-sm text-white" />
                  </div>
                </div>
                <button 
                  onClick={handleYoutubeTrim} 
                  disabled={!ytUrl || isTrimming}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed py-2 rounded text-sm text-white transition-colors"
                >
                  {isTrimming ? 'Downloading & Trimming...' : 'Download Clip'}
                </button>
              </div>
            )}
            
            {results.length === 0 && !isSearching && activeTab !== 'youtube' && (
              <div className="text-center text-slate-500 mt-10">No results found.</div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-white/5 bg-[#0e1016] p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-medium text-slate-300 flex items-center gap-2">
            <Captions className="h-3.5 w-3.5 text-sky-400" />
            Auto subtitles
          </h4>
          <button
            onClick={() => updateSubtitleSettings({ enabled: !subtitleSettings.enabled })}
            className={`h-5 w-9 rounded-full p-0.5 transition-colors ${
              subtitleSettings.enabled ? 'bg-violet-600' : 'bg-slate-700'
            }`}
          >
            <span
              className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                subtitleSettings.enabled ? 'translate-x-4' : ''
              }`}
            />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-slate-600">Size</label>
            <input
              type="range"
              min="28"
              max="72"
              value={subtitleSettings.fontSize}
              onChange={(event) => updateSubtitleSettings({ fontSize: Number(event.target.value) })}
              className="w-full accent-violet-500"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-600 block mb-1">Position</label>
            <select
              value={subtitleSettings.position}
              onChange={(event) =>
                updateSubtitleSettings({ position: event.target.value as 'bottom' | 'center' })
              }
              className="w-full bg-[#090b10] border border-white/10 rounded p-1 text-[10px]"
            >
              <option value="bottom">Bottom</option>
              <option value="center">Center</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
