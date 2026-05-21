import { delay } from "@/lib/utils/delay"
import { useDataStore } from "@/lib/store"
import type { OperationalEvent } from "@/lib/types"

export interface EventAPI {
  listByVendor(vendorId: string): Promise<OperationalEvent[]>
  listAll(): Promise<OperationalEvent[]>
  getById(id: string): Promise<OperationalEvent | null>
  updateStatus(id: string, status: OperationalEvent["status"]): Promise<OperationalEvent>
}

export const mockEventAPI: EventAPI = {
  async listByVendor(vendorId) {
    console.log("[MOCK API] EventAPI.listByVendor", { vendorId })
    await delay(400)
    return useDataStore.getState().operationalEvents.filter((e) => e.vendorId === vendorId)
  },

  async listAll() {
    console.log("[MOCK API] EventAPI.listAll")
    await delay(500)
    return useDataStore.getState().operationalEvents
  },

  async getById(id) {
    console.log("[MOCK API] EventAPI.getById", { id })
    await delay(200)
    return useDataStore.getState().operationalEvents.find((e) => e.id === id) ?? null
  },

  async updateStatus(id, status) {
    console.log("[MOCK API] EventAPI.updateStatus", { id, status })
    await delay(300)
    const store = useDataStore.getState()
    store.updateEvent(id, { status })
    return useDataStore.getState().operationalEvents.find((e) => e.id === id)!
  },
}
