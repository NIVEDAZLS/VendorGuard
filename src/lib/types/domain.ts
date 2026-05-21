export interface Vendor {
  id: string
  name: string
  industry: string
  contactEmail: string
  contactName: string
  relationshipOwner: string
  createdAt: string
}

export interface Contract {
  id: string
  vendorId: string
  fileName: string
  status: "uploaded" | "extracting" | "extracted" | "approved"
  uploadedAt: string
}

export interface SLARule {
  id: string
  contractId: string
  metricType: "delivery_time" | "uptime" | "response_time" | "quality"
  metricLabel: string
  threshold: { value: number; unit: string }
  penalty: { type: "percent" | "flat"; value: number; basis: string }
  exceptions: Array<{ condition: string; modifiedThreshold: { value: number; unit: string } }>
  rawClauseText: string
  rawClausePage: number
  status: "draft" | "approved"
}

export interface DataSource {
  id: string
  vendorId: string
  type: "csv"
  name: string
  fieldMapping: Record<string, string>
  lastIngestedAt: string | null
}

export interface OperationalEvent {
  id: string
  vendorId: string
  sourceId: string
  externalId: string
  eventType: string
  shippedAt: string
  deliveredAt: string | null
  deadlineAt: string
  orderValue: number
  destination: string
  status: "in_transit" | "compliant" | "at_risk" | "exempted" | "breached"
}

export interface AtRiskItem {
  id: string
  ruleId: string
  eventId: string
  riskScore: number
  hoursRemaining: number
  alertSentAt: string
  vendorResponseId: string | null
  status: "pending" | "exempted" | "resolved_compliant" | "breached"
}

export interface VendorResponse {
  id: string
  atRiskItemId: string
  responseText: string
  receivedAt: string
  aiClassification: {
    matchesException: boolean
    clauseId?: string
    clauseText?: string
    reasoning: string
    confidence: number
  } | null
  finalDecision?: "exempt" | "proceed"
}

export interface Breach {
  id: string
  ruleId: string
  eventId: string
  breachedAt: string
  penaltyAmount: number
  evidence: {
    shippedAt: string
    deadlineAt: string
    deliveredAt: string | null
    hoursOverdue: number
    contractClause: string
    orderValue: number
  }
  status: "open" | "claim_drafted" | "claim_sent" | "recovered" | "disputed"
}

export type DraftTone = "firm" | "diplomatic" | "urgent"

export interface Claim {
  id: string
  breachId: string
  recipientEmail: string
  cc: string
  draftSubject: string
  draftBody: string
  draftTone: DraftTone
  status: "draft" | "sent" | "recovered" | "disputed"
  createdAt: string
  updatedAt: string
  sentAt: string | null
}

export interface AuditEntry {
  id: string
  entityType: string
  entityId: string
  action: string
  actor: "user" | "system" | "ai"
  payload: Record<string, unknown>
  timestamp: string
}
