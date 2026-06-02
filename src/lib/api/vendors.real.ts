import type { Vendor } from "@/lib/types"
import type { VendorAPI } from "./vendors"

const BASE = "http://localhost:8000/api"

function toVendor(r: Record<string, unknown>): Vendor {
  return {
    id: r.id as string,
    name: r.name as string,
    industry: r.industry as string,
    contactEmail: (r.contact_email ?? "") as string,
    contactName: (r.contact_name ?? "") as string,
    relationshipOwner: (r.relationship_owner ?? "") as string,
    createdAt: (r.created_at ?? new Date().toISOString()) as string,
  }
}

export const realVendorAPI: VendorAPI = {
  async list() {
    const res = await fetch(`${BASE}/vendors/`)
    if (!res.ok) throw new Error(`VendorAPI.list failed: ${res.status}`)
    const data: unknown[] = await res.json()
    return (data as Record<string, unknown>[]).map(toVendor)
  },

  async getById(id) {
    const res = await fetch(`${BASE}/vendors/${id}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`VendorAPI.getById failed: ${res.status}`)
    return toVendor(await res.json())
  },

  async create(data) {
    const res = await fetch(`${BASE}/vendors/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.name,
        industry: data.industry,
        contact_email: data.contactEmail,
        contact_name: data.contactName,
        relationship_owner: data.relationshipOwner,
      }),
    })
    if (!res.ok) throw new Error(`VendorAPI.create failed: ${res.status}`)
    return toVendor(await res.json())
  },

  async update(id, patch) {
    const res = await fetch(`${BASE}/vendors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: patch.name,
        industry: patch.industry,
        contact_email: patch.contactEmail,
        contact_name: patch.contactName,
        relationship_owner: patch.relationshipOwner,
      }),
    })
    if (!res.ok) throw new Error(`VendorAPI.update failed: ${res.status}`)
    return toVendor(await res.json())
  },

  async remove(id) {
    const res = await fetch(`${BASE}/vendors/${id}`, { method: "DELETE" })
    if (!res.ok) throw new Error(`VendorAPI.remove failed: ${res.status}`)
  },
}
