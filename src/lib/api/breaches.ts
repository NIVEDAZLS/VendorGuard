import { delay } from "@/lib/utils/delay"
import { useDataStore } from "@/lib/store"
import type { Breach } from "@/lib/types"

export interface BreachAPI {
  listByVendor(vendorId: string): Promise<Breach[]>
  listAll(): Promise<Breach[]>
  getById(id: string): Promise<Breach | null>
  updateStatus(id: string, status: Breach["status"]): Promise<Breach>
}

export const mockBreachAPI: BreachAPI = {
  async listByVendor(vendorId) {
    console.log("[MOCK API] BreachAPI.listByVendor", { vendorId })
    await delay(350)
    const store = useDataStore.getState()
    const vendorEventIds = store.operationalEvents
      .filter((e) => e.vendorId === vendorId)
      .map((e) => e.id)
    return store.breaches.filter((b) => vendorEventIds.includes(b.eventId))
  },

  async listAll() {
    console.log("[MOCK API] BreachAPI.listAll")
    await delay(400)
    return useDataStore.getState().breaches
  },

  async getById(id) {
    console.log("[MOCK API] BreachAPI.getById", { id })
    await delay(200)
    return useDataStore.getState().breaches.find((b) => b.id === id) ?? null
  },

  async updateStatus(id, status) {
    console.log("[MOCK API] BreachAPI.updateStatus", { id, status })
    await delay(400)
    const store = useDataStore.getState()
    store.updateBreach(id, { status })
    return useDataStore.getState().breaches.find((b) => b.id === id)!
  },
}
