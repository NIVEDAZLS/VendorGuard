import type { Contract, SLARule } from "@/lib/types"

export interface UploadContractRequest {
  vendorId: string
  file: File
}

export interface UploadContractResponse {
  contract: Contract
}

export interface ExtractionStatusResponse {
  contractId: string
  status: Contract["status"]
  rules: SLARule[]
}

export interface UpdateRuleRequest {
  ruleId: string
  patches: Partial<SLARule>
}

export interface IngestionRequest {
  sourceId: string
  file: File
}

export interface IngestionResponse {
  rowsImported: number
  errors: string[]
}

export interface AIAnalysisRequest {
  eventId: string
  ruleId: string
}

export interface ClaimDraftRequest {
  breachId: string
}

export interface ClaimDraftResponse {
  subject: string
  body: string
}
