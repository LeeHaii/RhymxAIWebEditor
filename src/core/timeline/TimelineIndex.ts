export type TimelineInterval<T> = {
  id: string
  start: number
  end: number
  value: T
}

export class TimelineIndex<T> {
  readonly intervals: TimelineInterval<T>[]
  readonly boundaries: number[]

  constructor(intervals: TimelineInterval<T>[]) {
    this.intervals = [...intervals].sort(
      (first, second) => first.start - second.start || first.end - second.end
    )
    this.boundaries = Array.from(
      new Set(this.intervals.flatMap((interval) => [interval.start, interval.end]))
    ).sort((first, second) => first - second)
  }

  private firstBoundaryAtOrAfter(time: number) {
    let left = 0
    let right = this.boundaries.length
    while (left < right) {
      const middle = (left + right) >>> 1
      if (this.boundaries[middle] < time) left = middle + 1
      else right = middle
    }
    return left
  }

  private firstBoundaryAfter(time: number) {
    let left = 0
    let right = this.boundaries.length
    while (left < right) {
      const middle = (left + right) >>> 1
      if (this.boundaries[middle] <= time) left = middle + 1
      else right = middle
    }
    return left
  }

  queryRange(start: number, end: number, overscan = 0) {
    const lower = Math.max(0, start - overscan)
    const upper = end + overscan
    let left = 0
    let right = this.intervals.length
    while (left < right) {
      const middle = (left + right) >>> 1
      if (this.intervals[middle].start < lower) left = middle + 1
      else right = middle
    }
    let cursor = left
    while (cursor > 0 && this.intervals[cursor - 1].end > lower) cursor -= 1
    const output: TimelineInterval<T>[] = []
    for (; cursor < this.intervals.length; cursor += 1) {
      const interval = this.intervals[cursor]
      if (interval.start >= upper) break
      if (interval.end > lower) output.push(interval)
    }
    return output
  }

  nearestBoundary(time: number, threshold: number) {
    const insertion = this.firstBoundaryAtOrAfter(time)
    let nearest: number | null = null
    for (const index of [insertion - 1, insertion]) {
      const boundary = this.boundaries[index]
      if (boundary === undefined) continue
      if (Math.abs(boundary - time) <= threshold &&
          (nearest === null || Math.abs(boundary - time) < Math.abs(nearest - time))) {
        nearest = boundary
      }
    }
    return nearest
  }
  countBoundariesInRange(start: number, end: number) {
    const first = this.firstBoundaryAtOrAfter(start)
    const afterLast = this.firstBoundaryAfter(end)
    return Math.max(0, afterLast - first)
  }
}

