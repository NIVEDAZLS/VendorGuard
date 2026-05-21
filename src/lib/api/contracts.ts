import { delay } from "@/lib/utils/delay"
import { useDataStore } from "@/lib/store"
import type { Contract, SLARule } from "@/lib/types"
import type { ExtractionStatusResponse, UpdateRuleRequest } from "./types"

export interface ContractAPI {
  upload(vendorId: string, file: File): Promise<Contract>
  getExtractionStatus(contractId: string): Promise<ExtractionStatusResponse>
  getRules(contractId: string): Promise<SLARule[]>
  updateRule(req: UpdateRuleRequest): Promise<SLARule>
  approveRule(ruleId: string): Promise<SLARule>
}

export const mockContractAPI: ContractAPI = {
  async upload(vendorId, _file) {
    console.log("[MOCK API] ContractAPI.upload", { vendorId })
    await delay(1500)
    const store = useDataStore.getState()
    const id = `c-${String(store.contracts.length + 1).padStart(3, "0")}`
    const contract: Contract = {
      id,
      vendorId,
      fileName: _file.name,
      status: "uploaded",
      uploadedAt: new Date().toISOString(),
    }
    store.addContract(contract)
    store.addAuditEntry({
      id: `aud-${Date.now()}`,
      entityType: "contract",
      entityId: id,
      action: "contract.uploaded",
      actor: "user",
      payload: { fileName: _file.name },
      timestamp: new Date().toISOString(),
    })
    return contract
  },

  async getExtractionStatus(contractId) {
    console.log("[MOCK API] ContractAPI.getExtractionStatus", { contractId })
    await delay(400)
    const store = useDataStore.getState()
    const contract = store.contracts.find((c) => c.id === contractId)
    const rules = store.slaRules.filter((r) => r.contractId === contractId)
    return {
      contractId,
      status: contract?.status ?? "uploaded",
      rules,
    }
  },

  async getRules(contractId) {
    console.log("[MOCK API] ContractAPI.getRules", { contractId })
    await delay(300)
    return useDataStore.getState().slaRules.filter((r) => r.contractId === contractId)
  },

  async updateRule({ ruleId, patches }) {
    console.log("[MOCK API] ContractAPI.updateRule", { ruleId, patches })
    await delay(500)
    const store = useDataStore.getState()
    store.updateRule(ruleId, patches)
    return useDataStore.getState().slaRules.find((r) => r.id === ruleId)!
  },

  async approveRule(ruleId) {
    console.log("[MOCK API] ContractAPI.approveRule", { ruleId })
    await delay(600)
    const store = useDataStore.getState()
    store.approveRule(ruleId)
    return useDataStore.getState().slaRules.find((r) => r.id === ruleId)!
  },
}
