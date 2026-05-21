import { delay } from "@/lib/utils/delay"
import { useDataStore } from "@/lib/store"
import type { Vendor } from "@/lib/types"

export interface VendorAPI {
  list(): Promise<Vendor[]>
  getById(id: string): Promise<Vendor | null>
  create(data: Omit<Vendor, "id" | "createdAt">): Promise<Vendor>
  update(id: string, patch: Partial<Vendor>): Promise<Vendor>
  remove(id: string): Promise<void>
}

export const mockVendorAPI: VendorAPI = {
  async list() {
    console.log("[MOCK API] VendorAPI.list")
    await delay(300)
    return useDataStore.getState().vendors
  },

  async getById(id) {
    console.log("[MOCK API] VendorAPI.getById", { id })
    await delay(200)
    return useDataStore.getState().vendors.find((v) => v.id === id) ?? null
  },

  async create(data) {
    console.log("[MOCK API] VendorAPI.create", data)
    await delay(600)
    const store = useDataStore.getState()
    const id = `v-${String(store.vendors.length + 1).padStart(3, "0")}`
    const vendor: Vendor = { ...data, id, createdAt: new Date().toISOString() }
    store.addVendor(vendor)
    return vendor
  },

  async update(id, patch) {
    console.log("[MOCK API] VendorAPI.update", { id, patch })
    await delay(400)
    const store = useDataStore.getState()
    store.updateVendor(id, patch)
    return useDataStore.getState().vendors.find((v) => v.id === id)!
  },

  async remove(id) {
    console.log("[MOCK API] VendorAPI.remove", { id })
    await delay(300)
    useDataStore.getState().removeVendor(id)
  },
}
