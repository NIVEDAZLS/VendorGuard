import { create } from "zustand"

const HOUR_MS = 1000 * 60 * 60

interface DemoStore {
  accelerationEnabled: boolean
  accelerationStartReal: number
  accelerationStartSimulated: number

  setAcceleration: (enabled: boolean) => void
  now: () => number
  reset: () => void
}

export const useDemoStore = create<DemoStore>((set, get) => ({
  accelerationEnabled: false,
  accelerationStartReal: Date.now(),
  accelerationStartSimulated: Date.now(),

  setAcceleration: (enabled) => {
    const realNow = Date.now()
    if (enabled) {
      set({
        accelerationEnabled: true,
        accelerationStartReal: realNow,
        accelerationStartSimulated: realNow,
      })
    } else {
      // When turning off, advance the simulated time to where we left off
      const s = get()
      const simulatedNow = s.accelerationEnabled
        ? s.accelerationStartSimulated + (realNow - s.accelerationStartReal) * HOUR_MS
        : realNow
      set({
        accelerationEnabled: false,
        accelerationStartReal: realNow,
        accelerationStartSimulated: simulatedNow,
      })
    }
  },

  now: () => {
    const s = get()
    if (!s.accelerationEnabled) {
      return s.accelerationStartSimulated + (Date.now() - s.accelerationStartReal)
    }
    return s.accelerationStartSimulated + (Date.now() - s.accelerationStartReal) * HOUR_MS
  },

  reset: () => {
    set({
      accelerationEnabled: false,
      accelerationStartReal: Date.now(),
      accelerationStartSimulated: Date.now(),
    })
  },
}))
