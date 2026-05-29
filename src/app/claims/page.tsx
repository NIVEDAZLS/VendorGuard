"use client"

import { useState } from "react"
import Link from "next/link"
import { formatDistanceToNow, format } from "date-fns"
import { useDataStore } from "@/lib/store"
import { formatINR } from "@/lib/utils/format"
import { ClaimAPI } from "@/lib/api"
import { toast } from "sonner"

type TabId = "disputes" | "warnings"

function StatusPill({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

export default function DisputeReviewPage() {
  const [activeTab, setActiveTab] = useState<TabId>("disputes")
  const { claims, breaches, operationalEvents, vendors, slaRules, atRiskItems } = useDataStore()

  const vendorMap = new Map(vendors.map((v) => [v.id, v]))
  const eventMap = new Map(operationalEvents.map((e) => [e.id, e]))
  const breachMap = new Map(breaches.map((b) => [b.id, b]))
  const ruleMap = new Map(slaRules.map((r) => [r.id, r]))

  const disputeRows = claims
    .map((claim) => {
      const breach = breachMap.get(claim.breachId)
      const ev = breach ? eventMap.get(breach.eventId) : undefined
      const vendor = ev ? vendorMap.get(ev.vendorId) : undefined
      const rule = breach ? ruleMap.get(breach.ruleId) : undefined
      return { claim, breach, ev, vendor, rule }
    })
    .sort((a, b) => new Date(b.claim.createdAt).getTime() - new Date(a.claim.createdAt).getTime())

  const warningRows = atRiskItems
    .map((item) => {
      const ev = eventMap.get(item.eventId)
      const vendor = ev ? vendorMap.get(ev.vendorId) : undefined
      const rule = ruleMap.get(item.ruleId)
      return { item, ev, vendor, rule }
    })
    .sort((a, b) => a.item.hoursRemaining - b.item.hoursRemaining)

  const claimStatusConfig = {
    draft: { label: "Pending Review", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    sent: { label: "Sent · Awaiting Response", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    recovered: { label: "Recovered", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    disputed: { label: "Disputed", cls: "bg-red-500/10 text-red-600 dark:text-red-400" },
  }

  const warningStatusConfig: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pre-Breach", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    exempted: { label: "Resolved", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    breached: { label: "Expired → Breach", cls: "bg-red-500/10 text-red-600 dark:text-red-400" },
    resolved_compliant: { label: "Resolved", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 border rounded-xl p-1 w-fit">
        {(["disputes", "warnings"] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "disputes" ? "Dispute Emails" : "Pre-Breach Warnings"}
          </button>
        ))}
      </div>

      {/* Dispute Emails */}
      {activeTab === "disputes" && (
        <div className="space-y-4">
          {disputeRows.length === 0 && (
            <div className="border-2 border-dashed border-border rounded-xl p-16 text-center text-muted-foreground">
              <p className="font-semibold">No dispute emails yet</p>
              <p className="text-sm mt-1">
                Generate a claim from a breach to create a dispute email.
              </p>
            </div>
          )}
          {disputeRows.map(({ claim, breach, vendor, rule }) => {
            const sc = claimStatusConfig[claim.status as keyof typeof claimStatusConfig] ?? {
              label: claim.status,
              cls: "bg-muted text-muted-foreground",
            }
            const isSent = claim.status === "sent" || claim.status === "recovered"
            return (
              <div key={claim.id} className="border rounded-xl overflow-hidden bg-card">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b">
                  <div>
                    <p className="font-semibold text-sm">{vendor?.name ?? "Unknown Vendor"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Breach #{claim.breachId} · {rule?.metricLabel ?? "—"} ·
                      Penalty: {breach ? formatINR(breach.penaltyAmount) : "—"} ·
                      Generated{" "}
                      {formatDistanceToNow(new Date(claim.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <StatusPill label={sc.label} cls={sc.cls} />
                </div>

                {/* Body */}
                <div className="p-5">
                  <div
                    className={`bg-muted/50 border rounded-lg p-4 text-xs font-mono text-muted-foreground leading-relaxed mb-4 max-h-36 overflow-y-auto ${isSent ? "opacity-60" : ""}`}
                  >
                    {claim.draftSubject && (
                      <p className="font-semibold mb-2">Subject: {claim.draftSubject}</p>
                    )}
                    {claim.draftBody ?? "(No body generated)"}
                  </div>

                  <div className="flex gap-2">
                    {!isSent ? (
                      <>
                        <button
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-semibold rounded-lg transition-colors"
                          onClick={async () => {
                            await ClaimAPI.send(claim.id)
                            toast.success("Dispute email sent to vendor")
                          }}
                        >
                          ✓ Approve &amp; Send
                        </button>
                        <Link href={`/claims/${claim.id}`}>
                          <button className="px-3 py-1.5 border rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors">
                            ✎ Edit Draft
                          </button>
                        </Link>
                        <button
                          className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold rounded-lg hover:bg-red-500/20 transition-colors"
                          onClick={() => toast.info("Claim rejected")}
                        >
                          ✕ Reject
                        </button>
                      </>
                    ) : (
                      <>
                        <Link href={`/claims/${claim.id}`}>
                          <button className="px-3 py-1.5 border rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors">
                            View Full Email
                          </button>
                        </Link>
                        <button
                          className="px-3 py-1.5 border rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
                          onClick={() => toast.info("Follow-up sent")}
                        >
                          Send Follow-up
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pre-Breach Warnings */}
      {activeTab === "warnings" && (
        <div className="rounded-xl border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {["Vendor", "Warning Type", "SLA Rule", "Time Remaining", "Alert Sent", "Status", "Action"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left p-3 pl-4 text-[10px] font-semibold uppercase tracking-[1px] text-muted-foreground font-mono"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {warningRows.map(({ item, vendor, rule }) => {
                const sc = warningStatusConfig[item.status] ?? {
                  label: item.status,
                  cls: "bg-muted text-muted-foreground",
                }
                const hrs = item.hoursRemaining
                const timeLabel =
                  item.status === "breached"
                    ? "Expired → Breach"
                    : item.status !== "pending"
                    ? "Resolved"
                    : hrs < 1
                    ? "<1 hr remaining"
                    : `${Math.round(hrs)} hr${hrs !== 1 ? "s" : ""} remaining`
                const timeColor =
                  item.status !== "pending"
                    ? "text-muted-foreground"
                    : hrs < 4
                    ? "text-red-500"
                    : hrs < 12
                    ? "text-amber-500"
                    : "text-emerald-500"

                return (
                  <tr
                    key={item.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3 pl-4 font-semibold">{vendor?.name ?? "—"}</td>
                    <td className="p-3">
                      <StatusPill label={sc.label} cls={sc.cls} />
                    </td>
                    <td className="p-3 text-muted-foreground">{rule?.metricLabel ?? "—"}</td>
                    <td className={`p-3 font-mono tabular-nums ${timeColor}`}>{timeLabel}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">
                      {format(new Date(item.alertSentAt), "dd MMM, HH:mm")}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          item.status === "pending"
                            ? "bg-muted/50 text-muted-foreground"
                            : item.status === "exempted" || item.status === "resolved_compliant"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {item.status === "pending"
                          ? "Awaiting"
                          : item.status === "exempted" || item.status === "resolved_compliant"
                          ? "Exception Approved"
                          : "No Response"}
                      </span>
                    </td>
                    <td className="p-3">
                      <Link href={`/breaches/${item.id}`}>
                        <button className="px-3 py-1 border rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors">
                          {item.status === "pending" ? "Monitor" : "View"}
                        </button>
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {warningRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">
                    No pre-breach warnings issued yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
