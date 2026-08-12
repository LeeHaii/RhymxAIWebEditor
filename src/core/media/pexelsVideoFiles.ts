export type PexelsVideoFile = {
  link?: string
  width?: number | null
  height?: number | null
  file_type?: string
}

const usableMp4Files = (files: PexelsVideoFile[] = []) =>
  files.filter(
    (file) =>
      file.file_type === 'video/mp4' &&
      Boolean(file.link) &&
      Boolean(file.width) &&
      Boolean(file.height)
  )

export function selectPexelsVideoSources(files: PexelsVideoFile[] = []) {
  const usable = usableMp4Files(files)
  const exportFile =
    [...usable]
      .filter((file) => (file.width || 0) <= 1920)
      .sort((first, second) => (second.width || 0) - (first.width || 0))[0] ||
    [...usable].sort((first, second) => (first.width || 0) - (second.width || 0))[0]
  const previewFile = [...usable].sort((first, second) => {
    const firstDistance = Math.abs((first.width || 0) - 960)
    const secondDistance = Math.abs((second.width || 0) - 960)
    return firstDistance - secondDistance || (first.width || 0) - (second.width || 0)
  })[0]

  return {
    sourceUrl: exportFile?.link || '',
    previewSourceUrl: previewFile?.link || exportFile?.link || '',
  }
}
