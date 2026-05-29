"use client"

import Link from "next/link"
import { subDays } from "date-fns"
import { useDataStore } from "@/lib/store"
import { formatINR } from "@/lib/utils/format"

function ComplianceBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className={`text-sm font-medium tabular-nums ${
        pct >= 98 ? "text-emerald-500" : pct >= 90 ? "text-amber-500" : "text-red-500"
      }`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}

function StatusPill({ status }: { status: "Healthy" | "At Risk" | "Critical" }) {
  const cfg = {
    Healthy: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    "At Risk": "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    Critical: "bg-red-500/10 text-red-600 dark:text-red-400",
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg[status]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}

export default function PortfolioOverviewPage() {
  const { vendors, contracts, breaches, operationalEvents } = useDataStore()

  const now = new Date()
  const thirtyDaysAgo = subDays(now, 30)
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  const approvedContractVendorIds = new Set(
    contracts.filter((c) => c.status === "approved").map((c) => c.vendorId)
  )

  const recentBreaches = breaches.filter(
    (b) => new Date(b.breachedAt) >= thirtyDaysAgo
  )

  const penaltiesIdentifiedMTD = recentBreaches.reduce(
    (sum, b) => sum + b.penaltyAmount,
    0
  )

  const penaltiesRecoveredYTD = breaches
    .filter(
      (b) =>
        b.status === "recovered" &&
        new Date(b.breachedAt) >= startOfYear
    )
    .reduce((sum, b) => sum + b.penaltyAmount, 0)

  const activeBreachCount = recentBreaches.length
  const contractsMonitored = vendors.filter((v) =>
    approvedContractVendorIds.has(v.id)
  ).length

  const vendorRows = vendors
    .filter((v) => approvedContractVendorIds.has(v.id))
    .map((v) => {
      const contract = contracts.find(
        (c) => c.vendorId === v.id && c.status === "approved"
      )
      const vendorEventIds = new Set(
        operationalEvents
          .filter((e) => e.vendorId === v.id)
          .map((e) => e.id)
      )
      const vendorBreaches30d = recentBreaches.filter((b) =>
        vendorEventIds.has(b.eventId)
      )
      const totalEvents = operationalEvents.filter((e) => e.vendorId === v.id).length
      const compliancePct =
        totalEvents > 0
          ? ((totalEvents - vendorBreaches30d.length) / totalEvents) * 100
          : 100
      const penaltiesOwed = vendorBreaches30d.reduce(
        (s, b) => s + b.penaltyAmount,
        0
      )
      const penaltiesPaid = vendorBreaches30d
        .filter((b) => b.status === "recovered")
        .reduce((s, b) => s + b.penaltyAmount, 0)
      const status: "Healthy" | "At Risk" | "Critical" =
        compliancePct >= 98 ? "Healthy" : compliancePct >= 90 ? "At Risk" : "Critical"

      return {
        vendor: v,
        contract,
        compliancePct,
        breachCount30d: vendorBreaches30d.length,
        penaltiesOwed,
        penaltiesPaid,
        status,
      }
    })
    .sort((a, b) => a.compliancePct - b.compliancePct)

  const kpis = [
    {
      label: "Penalties Identified (MTD)",
      value: formatINR(penaltiesIdentifiedMTD),
      sub: "↑ 12% vs last month",
      color: "text-red-500",
      bar: "bg-red-500",
      accent: "border-t-red-500",
    },
    {
      label: "Penalties Recovered (YTD)",
      value: formatINR(penaltiesRecoveredYTD),
      sub:
        penaltiesIdentifiedMTD > 0
          ? `${Math.round((penaltiesRecoveredYTD / Math.max(penaltiesIdentifiedMTD, 1)) * 100)}% recovery rate`
          : "—",
      color: "text-emerald-500",
      bar: "bg-emerald-500",
      accent: "border-t-emerald-500",
    },
    {
      label: "Active Breaches (30d)",
      value: String(activeBreachCount),
      sub: `${breaches.filter((b) => b.status === "claim_drafted").length} pending disputes`,
      color: "text-amber-500",
      bar: "bg-amber-500",
      accent: "border-t-amber-500",
    },
    {
      label: "Contracts Monitored",
      value: String(contractsMonitored),
      sub: "All active · Last scan 00:14",
      color: "text-blue-500",
      bar: "bg-blue-500",
      accent: "border-t-blue-500",
    },
  ]

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className={`rounded-xl border bg-card p-5 relative overflow-hidden border-t-2 ${k.accent}`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {k.label}
            </p>
            <p className={`text-3xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
            <p className="text-xs text-muted-foreground mt-2">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Vendor Compliance Scorecard */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-base">Vendor Compliance Scorecard</h2>
          <span className="text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">
            Last scan: {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}, {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} IST
          </span>
        </div>
        <div className="rounded-xl border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                {["Vendor", "Contract", "Compliance %", "Breaches (30d)", "Penalties Owed", "Penalties Paid", "Status", "Action"].map(
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
              {vendorRows.map(({ vendor, contract, compliancePct, breachCount30d, penaltiesOwed, penaltiesPaid, status }) => (
                <tr
                  key={vendor.id}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="p-3 pl-4">
                    <p className="font-semibold">{vendor.name}</p>
                    <p className="text-xs text-muted-foreground">{vendor.industry}</p>
                  </td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">
                    {contract?.fileName.replace(".pdf", "") ?? "—"}
                  </td>
                  <td className="p-3">
                    <ComplianceBar
                      pct={compliancePct}
                      color={
                        compliancePct >= 98
                          ? "bg-emerald-500"
                          : compliancePct >= 90
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }
                    />
                  </td>
                  <td className="p-3">
                    <span className={`font-semibold tabular-nums ${breachCount30d > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      {breachCount30d}
                    </span>
                  </td>
                  <td className="p-3 font-mono tabular-nums text-red-500 font-medium">
                    {penaltiesOwed > 0 ? formatINR(penaltiesOwed) : "—"}
                  </td>
                  <td className="p-3 font-mono tabular-nums text-emerald-500 font-medium">
                    {penaltiesPaid > 0 ? formatINR(penaltiesPaid) : "—"}
                  </td>
                  <td className="p-3">
                    <StatusPill status={status} />
                  </td>
                  <td className="p-3">
                    <Link href="/contracts">
                      <button className="px-3 py-1 rounded-md border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors">
                        View
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
              {vendorRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">
                    No approved contracts yet. Upload a contract to start monitoring.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
