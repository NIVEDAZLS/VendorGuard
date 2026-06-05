import { BASE } from "@/lib/api/base"
import type { Claim } from "@/lib/types"
import type { ClaimAPI } from "./claims"


function toClaim(r: Record<string, unknown>): Claim {
  return {
    id: r.id as string,
    breachId: (r.breach_id ?? "") as string,
    recipientEmail: (r.contact_email ?? "") as string,
    cc: "",
    draftSubject: (r.email_subject ?? "") as string,
    draftBody: (r.email_body ?? "") as string,
    draftTone: "firm",
    status: (r.status === "pending_review" ? "draft" : r.status === "approved" ? "draft" : r.status === "sent" ? "sent" : "draft") as Claim["status"],
    createdAt: (r.created_at ?? new Date().toISOString()) as string,
    updatedAt: (r.created_at ?? new Date().toISOString()) as string,
    sentAt: (r.sent_at ?? null) as string | null,
  }
}

export const realClaimAPI: ClaimAPI = {
  async listByBreach(breachId) {
    const res = await fetch(`${BASE}/disputes/?breach_id=${breachId}`)
    if (!res.ok) throw new Error(`ClaimAPI.listByBreach failed: ${res.status}`)
    const data: unknown[] = await res.json()
    return (data as Record<string, unknown>[]).map(toClaim)
  },

  async listAll() {
    const res = await fetch(`${BASE}/disputes/`)
    if (!res.ok) throw new Error(`ClaimAPI.listAll failed: ${res.status}`)
    const data: unknown[] = await res.json()
    return (data as Record<string, unknown>[]).map(toClaim)
  },

  async getById(id) {
    // Fetch all and find by id (no single-dispute GET endpoint needed)
    const res = await fetch(`${BASE}/disputes/`)
    if (!res.ok) return null
    const data: unknown[] = await res.json()
    const found = (data as Record<string, unknown>[]).find((r) => r.id === id)
    return found ? toClaim(found) : null
  },

  async send(id) {
    const res = await fetch(`${BASE}/disputes/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "sent" }),
    })
    if (!res.ok) throw new Error(`ClaimAPI.send failed: ${res.status}`)
    const existing = await this.getById(id)
    return existing ?? ({ id, status: "sent" } as Claim)
  },

  async create(data) {
    // Trigger Agent 3 to draft a dispute email for this breach
    const res = await fetch(`${BASE}/disputes/${data.breachId}/draft`, { method: "POST" })
    if (!res.ok) throw new Error(`ClaimAPI.create failed: ${res.status}`)
    const result = await res.json() as Record<string, unknown>
    const now = new Date().toISOString()
    return {
      id: (result.dispute_id ?? `cl-${Date.now()}`) as string,
      breachId: data.breachId,
      recipientEmail: data.recipientEmail,
      cc: data.cc ?? "",
      draftSubject: data.draftSubject ?? "",
      draftBody: (result.email_body ?? data.draftBody ?? "") as string,
      draftTone: data.draftTone ?? "firm",
      status: "draft",
      createdAt: now,
      updatedAt: now,
      sentAt: null,
    }
  },

  async update(id, patch) {
    if (patch.status) {
      await fetch(`${BASE}/disputes/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: patch.status }),
      })
    }
    const existing = await this.getById(id)
    return existing ?? ({ id, ...patch } as Claim)
  },
}
