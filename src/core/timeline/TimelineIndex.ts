export type TimelineInterval<T> = {
  id: string
  start: number
  end: number
  value: T
}

export class TimelineIndex<T> {
  readonly intervals: TimelineInterval<T>[]

  constructor(intervals: TimelineInterval<T>[]) {
    this.intervals = [...intervals].sort(
      (first, second) => first.start - second.start || first.end - second.end
    )
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
    const boundaries = this.intervals.flatMap((interval) => [interval.start, interval.end])
    let nearest: number | null = null
    for (const boundary of boundaries) {
      if (Math.abs(boundary - time) <= threshold &&
          (nearest === null || Math.abs(boundary - time) < Math.abs(nearest - time))) {
        nearest = boundary
      }
    }
    return nearest
  }
}

