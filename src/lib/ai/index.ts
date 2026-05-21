/*
 ── VendorGuard AI Service Layer ───────────────────────────────────────────

 All AI/ML service access goes through the exported functions below.
 Currently every function is a mock that simulates latency and reads/writes
 the zustand store.

 ── Swapping to real implementations ───────────────────────────────────────

 When ready to connect real AI backends, replace the exports here:

   import { realExtractSLAs } from "./extract.real"
   export const extractSLAs = realExtractSLAs

 For environment-based switching:

   export const extractSLAs =
     process.env.NEXT_PUBLIC_USE_MOCKS === "false"
       ? realExtractSLAs
       : mockExtractSLAs
*/

export { extractSLAs } from "./extract"
export { suggestFieldMapping } from "./mapFields"
export { classifyVendorResponse } from "./classifyResponse"
export { composeVendorAlert } from "./composeAlert"
export { draftClaimEmail } from "./draftClaim"
