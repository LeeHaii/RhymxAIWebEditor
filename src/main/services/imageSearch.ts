import axios from 'axios'
import { ImageSearchResult } from '../../types/editor'

export async function searchPexelsImages(
  query: string,
  apiKey: string
): Promise<ImageSearchResult[]> {
  if (!apiKey.trim()) {
    throw new Error('Add a Pexels API key in Settings before searching Pexels Images.')
  }

  const response = await axios.get('https://api.pexels.com/v1/search', {
    headers: { Authorization: apiKey.trim() },
    params: { query, per_page: 18, orientation: 'landscape' },
    timeout: 15000,
  })

  return (response.data.photos || []).map((photo: any) => ({
    id: `pexels_image_${photo.id}`,
    sourceUrl: photo.src?.large2x || photo.src?.original,
    thumbnailUrl: photo.src?.medium || photo.src?.small,
    title: photo.alt || `Photo by ${photo.photographer}`,
    source: 'pexels' as const,
  }))
}

export async function searchGoogleImages(
  query: string,
  apiKey: string,
  searchEngineId: string
): Promise<ImageSearchResult[]> {
  if (!apiKey.trim() || !searchEngineId.trim()) {
    throw new Error(
      'Add both a Google Custom Search API key and Search Engine ID in Settings.'
    )
  }

  try {
    const response = await axios.get('https://customsearch.googleapis.com/customsearch/v1', {
      params: {
        q: query.trim(),
        searchType: 'image',
        num: 10,
        safe: 'active',
        key: apiKey.trim(),
        cx: searchEngineId.trim(),
      },
      timeout: 15000,
    })

    return (response.data.items || []).map((item: any, index: number) => ({
      id: `google_image_${item.cacheId || index}_${encodeURIComponent(item.link)}`,
      sourceUrl: item.link,
      thumbnailUrl: item.image?.thumbnailLink || item.link,
      title: item.title || item.displayLink || 'Google image',
      source: 'google' as const,
    }))
  } catch (error: any) {
    const apiMessage = error?.response?.data?.error?.message
    throw new Error(
      apiMessage || 'Google Images search failed. Check the API key and Search Engine ID.'
    )
  }
}

export async function searchImages(query: string, pexelsKey?: string): Promise<ImageSearchResult[]> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return []

  try {
    return await searchPexelsImages(trimmedQuery, pexelsKey || '')
  } catch (error: any) {
    const apiMessage = error?.response?.data?.error?.message
    throw new Error(apiMessage || error?.message || 'Pexels image search failed.')
  }
}

export async function searchWikimediaImages(query: string): Promise<ImageSearchResult[]> {
  const response = await axios.get('https://commons.wikimedia.org/w/api.php', {
    params: {
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: 6,
      gsrlimit: 20,
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: 640,
    },
    timeout: 15000,
  })

  const pages = Object.values(response.data.query?.pages || {}) as any[]
  return pages
    .map((page) => {
      const image = page.imageinfo?.[0]
      if (!image?.url) return null
      return {
        id: `commons_${page.pageid}`,
        sourceUrl: image.url,
        thumbnailUrl: image.thumburl || image.url,
        title: String(page.title || '').replace(/^File:/, ''),
        source: 'wikimedia' as const,
      }
    })
    .filter((result): result is NonNullable<typeof result> => Boolean(result))
}
