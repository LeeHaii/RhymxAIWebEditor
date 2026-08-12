export type ScrubSnapshot = {
  active: boolean
  timeSec: number
}

let snapshot: ScrubSnapshot = { active: false, timeSec: 0 }
const listeners = new Set<() => void>()

const publish = (active: boolean, timeSec: number) => {
  const nextTime = Math.max(0, timeSec)
  if (snapshot.active === active && snapshot.timeSec === nextTime) return
  snapshot = { active, timeSec: nextTime }
  listeners.forEach((listener) => listener())
}

export const beginScrub = (timeSec: number) => publish(true, timeSec)

export const updateScrub = (timeSec: number) => publish(true, timeSec)

export const endScrub = (timeSec: number) => publish(false, timeSec)

export const getScrubSnapshot = () => snapshot

export const subscribeToScrub = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
