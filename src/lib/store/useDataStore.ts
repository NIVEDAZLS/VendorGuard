import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  Vendor,
  Contract,
  SLARule,
  DataSource,
  OperationalEvent,
  AtRiskItem,
  VendorResponse,
  Breach,
  Claim,
  AuditEntry,
} from "@/lib/types"
import { getSeedData } from "@/lib/seed/seedData"

export interface DataStore {
  vendors: Vendor[]
  contracts: Contract[]
  slaRules: SLARule[]
  dataSources: DataSource[]
  operationalEvents: OperationalEvent[]
  atRiskItems: AtRiskItem[]
  vendorResponses: VendorResponse[]
  breaches: Breach[]
  claims: Claim[]
  auditEntries: AuditEntry[]

  addVendor: (v: Vendor) => void
  updateVendor: (id: string, patch: Partial<Vendor>) => void
  removeVendor: (id: string) => void

  addContract: (c: Contract) => void
  updateContract: (id: string, patch: Partial<Contract>) => void

  addRule: (r: SLARule) => void
  updateRule: (id: string, patch: Partial<SLARule>) => void
  approveRule: (id: string) => void

  addDataSource: (ds: DataSource) => void
  updateDataSource: (id: string, patch: Partial<DataSource>) => void

  addEvent: (e: OperationalEvent) => void
  updateEvent: (id: string, patch: Partial<OperationalEvent>) => void

  addAtRiskItem: (a: AtRiskItem) => void
  updateAtRiskItem: (id: string, patch: Partial<AtRiskItem>) => void

  addVendorResponse: (vr: VendorResponse) => void

  addBreach: (b: Breach) => void
  updateBreach: (id: string, patch: Partial<Breach>) => void

  addClaim: (c: Claim) => void
  updateClaim: (id: string, patch: Partial<Claim>) => void

  addAuditEntry: (e: AuditEntry) => void

  reset: () => void
}

function immutableUpdate<T extends { id: string }>(
  list: T[],
  id: string,
  patch: Partial<T>
): T[] {
  const idx = list.findIndex((x) => x.id === id)
  if (idx === -1) return list
  const copy = [...list]
  copy[idx] = { ...copy[idx], ...patch }
  return copy
}

const seed = getSeedData()

export const useDataStore = create<DataStore>()(
  persist(
    (set) => ({
      ...seed,

      addVendor: (v) => set((s) => ({ vendors: [...s.vendors, v] })),
      updateVendor: (id, patch) =>
        set((s) => ({ vendors: immutableUpdate(s.vendors, id, patch) })),
      removeVendor: (id) =>
        set((s) => ({ vendors: s.vendors.filter((x) => x.id !== id) })),

      addContract: (c) => set((s) => ({ contracts: [...s.contracts, c] })),
      updateContract: (id, patch) =>
        set((s) => ({ contracts: immutableUpdate(s.contracts, id, patch) })),

      addRule: (r) => set((s) => ({ slaRules: [...s.slaRules, r] })),
      updateRule: (id, patch) =>
        set((s) => ({ slaRules: immutableUpdate(s.slaRules, id, patch) })),
      approveRule: (id) =>
        set((s) => ({
          slaRules: immutableUpdate(s.slaRules, id, {
            status: "approved",
          } as Partial<SLARule>),
        })),

      addDataSource: (ds) =>
        set((s) => ({ dataSources: [...s.dataSources, ds] })),
      updateDataSource: (id, patch) =>
        set((s) => ({
          dataSources: immutableUpdate(s.dataSources, id, patch),
        })),

      addEvent: (e) =>
        set((s) => ({ operationalEvents: [...s.operationalEvents, e] })),
      updateEvent: (id, patch) =>
        set((s) => ({
          operationalEvents: immutableUpdate(s.operationalEvents, id, patch),
        })),

      addAtRiskItem: (a) =>
        set((s) => ({ atRiskItems: [...s.atRiskItems, a] })),
      updateAtRiskItem: (id, patch) =>
        set((s) => ({
          atRiskItems: immutableUpdate(s.atRiskItems, id, patch),
        })),

      addVendorResponse: (vr) =>
        set((s) => ({ vendorResponses: [...s.vendorResponses, vr] })),

      addBreach: (b) => set((s) => ({ breaches: [...s.breaches, b] })),
      updateBreach: (id, patch) =>
        set((s) => ({ breaches: immutableUpdate(s.breaches, id, patch) })),

      addClaim: (c) => set((s) => ({ claims: [...s.claims, c] })),
      updateClaim: (id, patch) =>
        set((s) => ({ claims: immutableUpdate(s.claims, id, patch) })),

      addAuditEntry: (e) =>
        set((s) => ({ auditEntries: [...s.auditEntries, e] })),

      reset: () => set({ ...getSeedData() }),
    }),
    {
      name: "vendorguard-store",
      version: 2,
    }
  )
)
