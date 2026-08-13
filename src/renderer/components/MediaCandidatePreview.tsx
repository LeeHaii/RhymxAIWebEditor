import React from 'react'
import { MediaCandidate } from '../../types/editor'

export default function MediaCandidatePreview({
  candidate,
  className = 'h-full w-full object-cover',
}: {
  candidate: MediaCandidate
  className?: string
}) {
  if (candidate.provider === 'archive_org' && candidate.kind === 'video') {
    return (
      <iframe
        src={`https://archive.org/embed/${encodeURIComponent(candidate.id)}?autoplay=0`}
        title={`Preview ${candidate.title}`}
        className={className}
        allow="fullscreen"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    )
  }

  if (candidate.kind === 'video') {
    return (
      <video
        src={candidate.previewUrl}
        poster={candidate.thumbnailUrl}
        muted
        controls
        preload="metadata"
        className={className}
      />
    )
  }

  return (
    <img
      src={candidate.thumbnailUrl || candidate.previewUrl}
      alt={candidate.title}
      loading="lazy"
      className={className}
    />
  )
}
