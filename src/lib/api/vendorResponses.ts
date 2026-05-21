import { delay } from "@/lib/utils/delay"
import { useDataStore } from "@/lib/store"
import type { VendorResponse } from "@/lib/types"

export interface VendorResponseAPI {
  listByAtRiskItem(atRiskItemId: string): Promise<VendorResponse[]>
  listAll(): Promise<VendorResponse[]>
  getById(id: string): Promise<VendorResponse | null>
  create(
    data: Omit<VendorResponse, "id" | "aiClassification">
  ): Promise<VendorResponse>
}

export const mockVendorResponseAPI: VendorResponseAPI = {
  async listByAtRiskItem(atRiskItemId) {
    console.log("[MOCK API] VendorResponseAPI.listByAtRiskItem", { atRiskItemId })
    await delay(250)
    return useDataStore
      .getState()
      .vendorResponses.filter((vr) => vr.atRiskItemId === atRiskItemId)
  },

  async listAll() {
    console.log("[MOCK API] VendorResponseAPI.listAll")
    await delay(300)
    return useDataStore.getState().vendorResponses
  },

  async getById(id) {
    console.log("[MOCK API] VendorResponseAPI.getById", { id })
    await delay(150)
    return useDataStore.getState().vendorResponses.find((vr) => vr.id === id) ?? null
  },

  async create(data) {
    console.log("[MOCK API] VendorResponseAPI.create", data)
    await delay(400)
    const store = useDataStore.getState()
    const id = `vr-${String(store.vendorResponses.length + 1).padStart(3, "0")}`
    const response: VendorResponse = { ...data, id, aiClassification: null }
    store.addVendorResponse(response)
    return response
  },
}
