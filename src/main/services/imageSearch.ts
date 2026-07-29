import axios from 'axios'

export async function searchImages(query: string): Promise<any[]> {
  // Simple proxy to a public API like DuckDuckGo or Unsplash for demonstration.
  // In a real local desktop app, we could scrape HTML or use a public free JSON API without CORS restrictions.
  
  // As an example, we will use the open Wikimedia API as a free fallback
  try {
    const res = await axios.get(`https://en.wikipedia.org/w/api.php`, {
      params: {
        action: 'query',
        format: 'json',
        prop: 'pageimages',
        generator: 'search',
        gsrsearch: query,
        gsrlimit: 10,
        piprop: 'original',
      }
    })
    
    if (!res.data.query || !res.data.query.pages) return []

    const pages = Object.values(res.data.query.pages) as any[]
    return pages
      .filter(p => p.original && p.original.source)
      .map((p, idx) => ({
        id: `img_${idx}`,
        sourceUrl: p.original.source,
        thumbnailUrl: p.original.source,
        title: p.title
      }))
  } catch (err) {
    console.error('Image search error', err)
    return []
  }
}
