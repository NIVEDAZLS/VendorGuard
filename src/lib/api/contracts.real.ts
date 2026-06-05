import { BASE } from "@/lib/api/base"
import type { Contract, SLARule } from "@/lib/types"
import type { ContractAPI } from "./contracts"
import type { ExtractionStatusResponse, UpdateRuleRequest } from "./types"


function toContract(r: Record<string, unknown>): Contract {
  return {
    id: r.id as string,
    vendorId: (r.vendor_id ?? r.vendorId) as string,
    fileName: (r.file_name ?? r.fileName) as string,
    status: (r.status ?? "uploaded") as Contract["status"],
    uploadedAt: (r.uploaded_at ?? r.uploadedAt ?? new Date().toISOString()) as string,
  }
}

function inferMetricType(unit: string | null | undefined): SLARule["metricType"] {
  if (!unit) return "delivery_time"
  const u = unit.toLowerCase()
  if (u === "percent") return "quality"
  if (u === "incidents" || u === "occurrences") return "quality"
  if (u === "minutes" || u === "hours" || u === "business_hours" || u === "days") return "delivery_time"
  if (u === "months") return "response_time"
  return "delivery_time"
}

function parseExceptions(raw: unknown): Array<{ condition: string; modifiedThreshold?: { value: number; unit: string } }> {
  if (Array.isArray(raw)) {
    return (raw as unknown[]).map(item => {
      if (typeof item === "string") return { condition: item }
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>
        return { condition: (obj.condition ?? JSON.stringify(obj)) as string }
      }
      return { condition: String(item) }
    })
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return parseExceptions(parsed)
    } catch {
      return raw ? [{ condition: raw }] : []
    }
  }
  return []
}

function toSLARule(r: Record<string, unknown>): SLARule {
  const thresholdUnit = (r.threshold_unit ?? "hours") as string
  const thresholdValue = Number(r.threshold_hours ?? r.threshold_value ?? 0)
  const penaltyType = r.penalty_type as string | null | undefined

  return {
    id: r.id as string,
    contractId: (r.contract_id ?? "") as string,
    metricType: inferMetricType(thresholdUnit),
    metricLabel: (r.metric_name ?? "") as string,
    threshold: { value: thresholdValue, unit: thresholdUnit },
    penalty: {
      type: (penaltyType === "percentage" ? "percent" : "flat") as "percent" | "flat",
      value: Number(r.penalty_value ?? 0),
      basis: thresholdUnit === "percent" ? "of invoice value" : "per event",
    },
    exceptions: parseExceptions(r.exception_clauses),
    rawClauseText: (r.note ?? "") as string,
    rawClausePage: Number(r.contract_section?.toString().replace(/\D/g, "").slice(0, 2) ?? 0),
    status: ((r.status ?? "draft") === "approved" ? "approved" : "draft") as "draft" | "approved",
  }
}

export const realContractAPI: ContractAPI = {
  async upload(vendorId, file) {
    const form = new FormData()
    form.append("vendor_id", vendorId)
    form.append("file", file)
    const res = await fetch(`${BASE}/contracts/upload`, { method: "POST", body: form })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`ContractAPI.upload failed: ${res.status} — ${err}`)
    }
    const data = await res.json() as Record<string, unknown>
    return {
      id: data.contract_id as string,
      vendorId: data.vendor_id as string,
      fileName: data.file_name as string,
      status: "approved",
      uploadedAt: new Date().toISOString(),
    }
  },

  async getExtractionStatus(contractId): Promise<ExtractionStatusResponse> {
    const res = await fetch(`${BASE}/contracts/${contractId}`)
    if (!res.ok) throw new Error(`ContractAPI.getExtractionStatus failed: ${res.status}`)
    const data = await res.json() as { contract: Record<string, unknown>; sla_rules: Record<string, unknown>[] }
    return {
      contractId,
      status: (data.contract.status ?? "uploaded") as Contract["status"],
      rules: data.sla_rules.map(toSLARule),
    }
  },

  async getRules(contractId) {
    const res = await fetch(`${BASE}/contracts/${contractId}`)
    if (!res.ok) throw new Error(`ContractAPI.getRules failed: ${res.status}`)
    const data = await res.json() as { sla_rules: Record<string, unknown>[] }
    return data.sla_rules.map(toSLARule)
  },

  async updateRule({ ruleId, patches }: UpdateRuleRequest): Promise<SLARule> {
    const res = await fetch(`${BASE}/contracts/rules/${ruleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patches),
    })
    if (!res.ok) throw new Error(`ContractAPI.updateRule failed: ${res.status}`)
    return { id: ruleId, ...patches } as SLARule
  },

  async approveRule(ruleId) {
    const res = await fetch(`${BASE}/contracts/rules/${ruleId}/approve`, { method: "POST" })
    if (!res.ok) throw new Error(`ContractAPI.approveRule failed: ${res.status}`)
    return { id: ruleId, status: "approved" } as SLARule
  },
}
