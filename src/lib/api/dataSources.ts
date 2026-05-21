import { delay } from "@/lib/utils/delay"
import { useDataStore } from "@/lib/store"
import type { DataSource } from "@/lib/types"

export interface DataSourceAPI {
  listByVendor(vendorId: string): Promise<DataSource[]>
  getById(id: string): Promise<DataSource | null>
  updateFieldMapping(id: string, mapping: Record<string, string>): Promise<DataSource>
  ingest(sourceId: string): Promise<{ rowsImported: number; errors: string[] }>
}

export const mockDataSourceAPI: DataSourceAPI = {
  async listByVendor(vendorId) {
    console.log("[MOCK API] DataSourceAPI.listByVendor", { vendorId })
    await delay(250)
    return useDataStore.getState().dataSources.filter((ds) => ds.vendorId === vendorId)
  },

  async getById(id) {
    console.log("[MOCK API] DataSourceAPI.getById", { id })
    await delay(200)
    return useDataStore.getState().dataSources.find((ds) => ds.id === id) ?? null
  },

  async updateFieldMapping(id, mapping) {
    console.log("[MOCK API] DataSourceAPI.updateFieldMapping", { id, mapping })
    await delay(500)
    const store = useDataStore.getState()
    store.updateDataSource(id, { fieldMapping: mapping })
    store.addAuditEntry({
      id: `aud-${Date.now()}`,
      entityType: "datasource",
      entityId: id,
      action: "datasource.field_mapping_updated",
      actor: "user",
      payload: { newMapping: mapping },
      timestamp: new Date().toISOString(),
    })
    return useDataStore.getState().dataSources.find((ds) => ds.id === id)!
  },

  async ingest(sourceId) {
    console.log("[MOCK API] DataSourceAPI.ingest", { sourceId })
    await delay(2000)
    const store = useDataStore.getState()
    store.updateDataSource(sourceId, { lastIngestedAt: new Date().toISOString() })
    store.addAuditEntry({
      id: `aud-${Date.now()}`,
      entityType: "datasource",
      entityId: sourceId,
      action: "datasource.ingested",
      actor: "system",
      payload: { rowsIngested: 2450 },
      timestamp: new Date().toISOString(),
    })
    return { rowsImported: 2450, errors: [] }
  },
}
