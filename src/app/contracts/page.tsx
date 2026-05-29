"use client"

import { useState } from "react"
import { Upload } from "lucide-react"
import { useDataStore } from "@/lib/store"
import { UploadContractDialog } from "@/components/shared/UploadContractDialog"
import { subDays } from "date-fns"

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    Healthy: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    "At Risk": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    Critical: "bg-red-500/10 text-red-600 dark:text-red-400",
    Approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    Extracting: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    Uploaded: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg[status] ?? "bg-muted text-muted-foreground"}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}

function BreachPill({ count }: { count: number }) {
  const cls =
    count >= 5
      ? "bg-red-500/10 text-red-600 dark:text-red-400"
      : count >= 2
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold font-mono ${cls}`}>
      {count}
    </span>
  )
}

export default function ContractManagerPage() {
  const [uploadOpen, setUploadOpen] = useState(false)
  const { contracts, vendors, slaRules, breaches, operationalEvents } = useDataStore()

  const now = new Date()
  const thirtyDaysAgo = subDays(now, 30)
  const vendorMap = new Map(vendors.map((v) => [v.id, v]))
  const eventMap = new Map(operationalEvents.map((e) => [e.id, e]))

  const approvedContracts = contracts.filter((c) => c.status === "approved")
  const totalRules = slaRules.length
  const totalBreaches = breaches.length

  const contractRows = contracts.map((c) => {
    const vendor = vendorMap.get(c.vendorId)
    const rules = slaRules.filter((r) => r.contractId === c.id)

    const vendorEventIds = new Set(
      operationalEvents.filter((e) => e.vendorId === c.vendorId).map((e) => e.id)
    )
    const vendorBreaches = breaches.filter((b) =>
      vendorEventIds.has(b.eventId)
    )

    const compliance =
      operationalEvents.filter((e) => e.vendorId === c.vendorId).length > 0
        ? ((operationalEvents.filter((e) => e.vendorId === c.vendorId).length -
            vendorBreaches.filter((b) => new Date(b.breachedAt) >= thirtyDaysAgo).length) /
            operationalEvents.filter((e) => e.vendorId === c.vendorId).length) *
          100
        : 100

    const vendorStatus: "Healthy" | "At Risk" | "Critical" =
      compliance >= 98 ? "Healthy" : compliance >= 90 ? "At Risk" : "Critical"

    const rulesWithBreaches = rules.map((rule) => {
      const ruleBreaches = vendorBreaches.filter((b) => b.ruleId === rule.id)
      return { rule, breachCount: ruleBreaches.length }
    })

    return { contract: c, vendor, rules, rulesWithBreaches, vendorStatus }
  })

  return (
    <div className="space-y-6">
      {/* Upload zone + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div
          className="lg:col-span-1 border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-500/5 transition-all"
          onClick={() => setUploadOpen(true)}
        >
          <div className="text-4xl mb-3">📄</div>
          <p className="font-semibold text-base mb-1">Upload Vendor Contract</p>
          <p className="text-xs text-muted-foreground mb-4">
            Drop a PDF here or click to browse
            <br />
            Agent 1 will extract SLA rules automatically
          </p>
          <button
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-black text-sm font-semibold rounded-lg transition-colors"
            onClick={(e) => { e.stopPropagation(); setUploadOpen(true) }}
          >
            Choose PDF
          </button>
        </div>

        <div className="lg:col-span-2 border rounded-xl p-5 bg-card">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            Extraction Status
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Agent 1 (Legal Architect) last ran on{" "}
            {approvedContracts.length > 0
              ? new Date(
                  Math.max(...approvedContracts.map((c) => new Date(c.uploadedAt).getTime()))
                ).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
              : "—"}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Contracts Loaded", value: approvedContracts.length, color: "text-emerald-500" },
              { label: "SLA Rules Extracted", value: totalRules, color: "text-blue-500" },
              { label: "Total Breaches Found", value: totalBreaches, color: "text-amber-500" },
            ].map((s) => (
              <div key={s.label} className="bg-muted/50 rounded-lg p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Contract cards */}
      {contractRows.map(({ contract, vendor, rules, rulesWithBreaches, vendorStatus }) => (
        <div key={contract.id} className="border rounded-xl overflow-hidden bg-card">
          {/* Card header */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <p className="font-semibold text-sm">
                {vendor?.name ?? "Unknown Vendor"} — {vendor?.industry ?? ""}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Uploaded{" "}
                {new Date(contract.uploadedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}{" "}
                · {rules.length} SLA rule{rules.length !== 1 ? "s" : ""} extracted ·{" "}
                {vendor?.industry ?? ""}
              </p>
            </div>
            <StatusPill status={vendorStatus} />
          </div>

          {/* Rules + Breach History */}
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="p-5 md:border-r">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Extracted SLA Rules
              </p>
              <div className="space-y-2">
                {rules.length === 0 && (
                  <p className="text-xs text-muted-foreground">No rules extracted yet.</p>
                )}
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="bg-muted/50 rounded-lg px-3 py-2.5"
                  >
                    <p className="text-sm font-semibold">{rule.metricLabel}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      Threshold: {rule.threshold.value} {rule.threshold.unit} · Penalty:{" "}
                      {rule.penalty.type === "percent"
                        ? `${rule.penalty.value}% of ${rule.penalty.basis}`
                        : `₹${rule.penalty.value}/${rule.penalty.basis}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Breach History per Rule
              </p>
              <div className="space-y-2">
                {rulesWithBreaches.length === 0 && (
                  <p className="text-xs text-muted-foreground">No data yet.</p>
                )}
                {rulesWithBreaches.map(({ rule, breachCount }) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2"
                  >
                    <span className="text-sm">{rule.metricLabel}</span>
                    <span className="flex items-center gap-1.5">
                      <BreachPill count={breachCount} />
                      <span className="text-xs text-muted-foreground">
                        breach{breachCount !== 1 ? "es" : ""}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}

      {contractRows.length === 0 && (
        <div className="border-2 border-dashed border-border rounded-xl p-16 text-center">
          <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold">No contracts yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Upload your first vendor contract to get started.
          </p>
        </div>
      )}

      <UploadContractDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  )
}
