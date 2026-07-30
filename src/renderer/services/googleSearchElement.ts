import { ImageSearchResult } from '../../types/editor'

type GoogleResult = {
  title?: string
  url?: string
  visibleUrl?: string
  contextUrl?: string
  image?: {
    url?: string
    width?: number
    height?: number
  }
}

type PendingSearch = {
  resolve: (results: ImageSearchResult[]) => void
  reject: (error: Error) => void
  timer: number
}

let loadedSearchEngineId = ''
let loader: Promise<void> | null = null
let pendingSearch: PendingSearch | null = null

const googleWindow = () => window as Window & {
  __gcse?: any
  google?: any
}

function finishSearch(results: GoogleResult[] | null | undefined) {
  if (!pendingSearch) return
  window.clearTimeout(pendingSearch.timer)
  const resolve = pendingSearch.resolve
  pendingSearch = null
  resolve(
    (results || [])
      .filter((result) => Boolean(result.image?.url))
      .map((result, index) => ({
        id: `google_element_${Date.now()}_${index}`,
        sourceUrl: result.image!.url!,
        thumbnailUrl: result.image!.url!,
        title: result.title || result.visibleUrl || 'Google image',
        source: 'google' as const,
      }))
  )
}

function loadGoogleSearchElement(searchEngineId: string): Promise<void> {
  const cx = searchEngineId.trim()
  if (!cx) {
    return Promise.reject(
      new Error('Add a Google Programmable Search Engine ID (CX) in Settings.')
    )
  }
  if (loadedSearchEngineId && loadedSearchEngineId !== cx) {
    return Promise.reject(
      new Error('The Google Search Engine ID changed. Restart the app once to reload it.')
    )
  }
  const existing = googleWindow().google?.search?.cse?.element?.getElement?.(
    'rhymx-google-images'
  )
  if (existing) return Promise.resolve()
  if (loader) return loader

  loadedSearchEngineId = cx
  loader = new Promise<void>((resolve, reject) => {
    const targetWindow = googleWindow()
    targetWindow.__gcse = {
      parsetags: 'explicit',
      initializationCallback: () => {
        try {
          targetWindow.google.search.cse.element.render({
            div: 'rhymx-google-cse-host',
            tag: 'searchresults-only',
            gname: 'rhymx-google-images',
            attributes: {
              enableImageSearch: true,
              defaultToImageSearch: true,
              disableWebSearch: true,
              imageSearchLayout: 'column',
              imageSearchResultSetSize: 'large',
              safeSearch: 'active',
            },
          })
          resolve()
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      },
      searchCallbacks: {
        image: {
          ready: (
            _name: string,
            _query: string,
            _promotions: unknown[],
            results: GoogleResult[],
            resultsDiv: HTMLDivElement
          ) => {
            finishSearch(results)
            resultsDiv.replaceChildren()
            return true
          },
        },
      },
    }

    const script = document.createElement('script')
    script.async = true
    script.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(cx)}`
    script.onerror = () => reject(new Error('Could not load Google Programmable Search.'))
    document.head.appendChild(script)
  })
  return loader
}

export async function searchGoogleImagesWithElement(
  searchEngineId: string,
  query: string
): Promise<ImageSearchResult[]> {
  await loadGoogleSearchElement(searchEngineId)
  const element = googleWindow().google?.search?.cse?.element?.getElement?.(
    'rhymx-google-images'
  )
  if (!element) throw new Error('Google Programmable Search did not initialize.')
  if (pendingSearch) {
    window.clearTimeout(pendingSearch.timer)
    pendingSearch.reject(new Error('A newer Google search replaced this request.'))
  }

  return await new Promise<ImageSearchResult[]>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pendingSearch = null
      reject(new Error('Google Images search timed out. Check the Search Engine ID.'))
    }, 20000)
    pendingSearch = { resolve, reject, timer }
    element.execute(query)
  })
}
