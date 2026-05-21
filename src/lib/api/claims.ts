import { delay } from "@/lib/utils/delay"
import { useDataStore } from "@/lib/store"
import type { Claim } from "@/lib/types"

export interface ClaimAPI {
  listByBreach(breachId: string): Promise<Claim[]>
  listAll(): Promise<Claim[]>
  getById(id: string): Promise<Claim | null>
  send(id: string): Promise<Claim>
  create(data: Omit<Claim, "id" | "createdAt" | "updatedAt" | "sentAt">): Promise<Claim>
  update(id: string, patch: Partial<Claim>): Promise<Claim>
}

export const mockClaimAPI: ClaimAPI = {
  async listByBreach(breachId) {
    console.log("[MOCK API] ClaimAPI.listByBreach", { breachId })
    await delay(250)
    return useDataStore.getState().claims.filter((c) => c.breachId === breachId)
  },

  async listAll() {
    console.log("[MOCK API] ClaimAPI.listAll")
    await delay(300)
    return useDataStore.getState().claims
  },

  async getById(id) {
    console.log("[MOCK API] ClaimAPI.getById", { id })
    await delay(150)
    return useDataStore.getState().claims.find((c) => c.id === id) ?? null
  },

  async send(id) {
    console.log("[MOCK API] ClaimAPI.send", { id })
    await delay(800)
    const store = useDataStore.getState()
    const now = new Date().toISOString()
    store.updateClaim(id, { status: "sent", sentAt: now, updatedAt: now })
    store.addAuditEntry({
      id: `aud-${Date.now()}`,
      entityType: "claim",
      entityId: id,
      action: "claim.sent",
      actor: "user",
      payload: {},
      timestamp: now,
    })
    return useDataStore.getState().claims.find((c) => c.id === id)!
  },

  async create(data) {
    console.log("[MOCK API] ClaimAPI.create", data)
    await delay(500)
    const store = useDataStore.getState()
    const id = `cl-${String(store.claims.length + 1).padStart(3, "0")}`
    const now = new Date().toISOString()
    const claim: Claim = { ...data, id, createdAt: now, updatedAt: now, sentAt: null }
    store.addClaim(claim)
    return claim
  },

  async update(id, patch) {
    console.log("[MOCK API] ClaimAPI.update", { id, patch })
    await delay(300)
    const store = useDataStore.getState()
    store.updateClaim(id, { ...patch, updatedAt: new Date().toISOString() })
    return useDataStore.getState().claims.find((c) => c.id === id)!
  },
}
