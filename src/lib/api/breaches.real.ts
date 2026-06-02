import type { Breach } from "@/lib/types"
import type { BreachAPI } from "./breaches"

const BASE = "http://localhost:8000/api"

function toBreach(r: Record<string, unknown>): Breach {
  return {
    id: r.id as string,
    ruleId: (r.rule_id ?? "") as string,
    eventId: (r.log_id ?? "") as string,
    breachedAt: (r.breached_at ?? new Date().toISOString()) as string,
    penaltyAmount: Number(r.penalty_amount ?? 0),
    evidence: {
      shippedAt: "",
      deadlineAt: "",
      deliveredAt: null,
      hoursOverdue: Number(r.delay_hours ?? 0),
      contractClause: (r.contract_section ?? "") as string,
      orderValue: 0,
    },
    status: (r.dispute_status ?? "open") as Breach["status"],
  }
}

export const realBreachAPI: BreachAPI = {
  async listByVendor(vendorId) {
    const res = await fetch(`${BASE}/breaches/?vendor_id=${vendorId}`)
    if (!res.ok) throw new Error(`BreachAPI.listByVendor failed: ${res.status}`)
    const data: unknown[] = await res.json()
    return (data as Record<string, unknown>[]).map(toBreach)
  },

  async listAll() {
    const res = await fetch(`${BASE}/breaches/`)
    if (!res.ok) throw new Error(`BreachAPI.listAll failed: ${res.status}`)
    const data: unknown[] = await res.json()
    return (data as Record<string, unknown>[]).map(toBreach)
  },

  async getById(id) {
    const res = await fetch(`${BASE}/breaches/${id}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`BreachAPI.getById failed: ${res.status}`)
    return toBreach(await res.json())
  },

  async updateStatus(id, status) {
    const res = await fetch(`${BASE}/disputes/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) throw new Error(`BreachAPI.updateStatus failed: ${res.status}`)
    const existing = await this.getById(id)
    return existing ?? ({ id, status } as Breach)
  },
}
