/*
 ── VendorGuard API Service Layer ──────────────────────────────────────────

 All API access goes through the exported objects below.
 Currently every service uses its mock implementation, which reads/writes
 the in-memory zustand store with simulated latency.

 ── Swapping to real implementations ───────────────────────────────────────

 When ready to connect real backends, replace the mock exports here:

   import { realContractAPI } from "./contracts.real"
   export const ContractAPI = realContractAPI

 Each API module exports an interface (e.g. ContractAPI) so you can type-
 check the real implementation against the same contract.

 For environment-based switching, you could do:

   export const ContractAPI =
     process.env.NEXT_PUBLIC_USE_MOCKS === "false"
       ? realContractAPI
       : mockContractAPI

 Types are importable from their individual files:
   import type { ContractAPI } from "@/lib/api/contracts"
*/

export { realVendorAPI as VendorAPI } from "./vendors.real"
export { realContractAPI as ContractAPI } from "./contracts.real"
export { realBreachAPI as BreachAPI } from "./breaches.real"
export { realClaimAPI as ClaimAPI } from "./claims.real"

// Not yet wired to backend — keep mock for now
export { mockDataSourceAPI as DataSourceAPI } from "./dataSources"
export { mockEventAPI as EventAPI } from "./events"
export { mockVendorResponseAPI as VendorResponseAPI } from "./vendorResponses"
