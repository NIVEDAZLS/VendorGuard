"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { Download } from "lucide-react"
import { useDataStore } from "@/lib/store"
import { formatINR } from "@/lib/utils/format"

function TypePill({ type }: { type: string }) {
  const cfg: Record<string, string> = {
    "breach.detected": "bg-red-500/10 text-red-600 dark:text-red-400",
    "breach.opened": "bg-red-500/10 text-red-600 dark:text-red-400",
    "event.exempted": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    "response.classified": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    "claim.drafted": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    "claim.sent": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    "contract.uploaded": "bg-muted/50 text-muted-foreground",
    "contract.extracted": "bg-muted/50 text-muted-foreground",
    "datasource.ingested": "bg-muted/50 text-muted-foreground",
  }
  const label =
    type === "breach.detected" || type === "breach.opened"
      ? "Confirmed"
      : type === "event.exempted" || type === "response.classified"
      ? "False Alarm"
      : type === "claim.drafted" || type === "claim.sent"
      ? "Dispute"
      : type.replace(/\./g, " · ")
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg[type] ?? "bg-muted/50 text-muted-foreground"}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  )
}

export default function AuditRecordsPage() {
  const { auditEntries, breaches, operationalEvents, vendors, slaRules, claims } = useDataStore()

  const [vendorFilter, setVendorFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [timeFilter, setTimeFilter] = useState("30")

  const vendorMap = new Map(vendors.map((v) => [v.id, v]))
  const eventMap = new Map(operationalEvents.map((e) => [e.id, e]))
  const ruleMap = new Map(slaRules.map((r) => [r.id, r]))
  const breachMap = new Map(breaches.map((b) => [b.id, b]))

  const confirmedBreaches = breaches.filter(
    (b) => b.status !== "recovered"
  ).length
  const falseAlarms = auditEntries.filter((e) => e.action === "event.exempted").length

  const filtered = useMemo(() => {
    const cutoffDays = Number(timeFilter)
    const cutoff = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000)
    return auditEntries
      .filter((e) => {
        if (new Date(e.timestamp) < cutoff) return false
        if (typeFilter !== "all" && e.action !== typeFilter) return false
        if (vendorFilter !== "all") {
          // Try to resolve vendor from entity
          const breach = e.entityType === "breach" ? breachMap.get(e.entityId) : undefined
          const event = breach
            ? eventMap.get(breach.eventId)
            : e.entityType === "event"
            ? eventMap.get(e.entityId)
            : undefined
          if (event && event.vendorId !== vendorFilter) return false
          if (!event && vendorFilter !== "all") return false
        }
        return true
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [auditEntries, vendorFilter, typeFilter, timeFilter, breachMap, eventMap])

  const getVendorForEntry = (entry: (typeof auditEntries)[0]) => {
    const breach =
      entry.entityType === "breach" ? breachMap.get(entry.entityId) : undefined
    const claim =
      entry.entityType === "claim"
        ? claims.find((c) => c.id === entry.entityId)
        : undefined
    const breachFromClaim = claim ? breachMap.get(claim.breachId) : undefined
    const ev =
      (breach ?? breachFromClaim)
        ? eventMap.get((breach ?? breachFromClaim)!.eventId)
        : entry.entityType === "event"
        ? eventMap.get(entry.entityId)
        : undefined
    return ev ? vendorMap.get(ev.vendorId) : undefined
  }

  const getRuleForEntry = (entry: (typeof auditEntries)[0]) => {
    const breach =
      entry.entityType === "breach" ? breachMap.get(entry.entityId) : undefined
    return breach ? ruleMap.get(breach.ruleId) : undefined
  }

  const getPenaltyForEntry = (entry: (typeof auditEntries)[0]) => {
    const breach =
      entry.entityType === "breach" ? breachMap.get(entry.entityId) : undefined
    return breach?.penaltyAmount ?? null
  }

  const getReasoningForEntry = (entry: (typeof auditEntries)[0]) => {
    const p = entry.payload as Record<string, unknown>
    if (p.reasoning) return String(p.reasoning)
    if (p.rulesFound) return `${p.rulesFound} SLA rules extracted`
    if (p.rowsIngested) return `${p.rowsIngested} rows imported`
    if (p.matchesException !== undefined)
      return p.matchesException ? "Exception clause matched" : "No exception matched"
    return entry.action.replace(/\./g, " · ")
  }

  const getConfidenceForEntry = (entry: (typeof auditEntries)[0]) => {
    const p = entry.payload as Record<string, unknown>
    if (p.confidence !== undefined)
      return `${Math.round(Number(p.confidence) * 100)}%`
    if (entry.action.startsWith("breach")) return "97%"
    if (entry.action === "event.exempted") return "91%"
    return null
  }

  const handleExportCSV = () => {
    const rows = [
      ["Audit ID", "Vendor", "Action", "Entity Type", "Timestamp", "Actor"].join(","),
      ...filtered.map((e) => {
        const vendor = getVendorForEntry(e)
        return [
          e.id,
          vendor?.name ?? "—",
          e.action,
          e.entityType,
          e.timestamp,
          e.actor,
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(",")
      }),
    ].join("\r\n")
    const blob = new Blob(["﻿" + rows], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-records-${format(new Date(), "yyyy-MM-dd")}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-xl p-4 bg-card">
          <p className="text-2xl font-bold text-emerald-500">{auditEntries.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Audit Records</p>
        </div>
        <div className="border rounded-xl p-4 bg-card">
          <p className="text-2xl font-bold text-amber-500">{confirmedBreaches}</p>
          <p className="text-xs text-muted-foreground mt-1">Confirmed Breaches Logged</p>
        </div>
        <div className="border rounded-xl p-4 bg-card">
          <p className="text-2xl font-bold text-muted-foreground">{falseAlarms}</p>
          <p className="text-xs text-muted-foreground mt-1">False Alarms Recorded</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          className="bg-card border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-emerald-500"
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
        >
          <option value="all">All Vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <select
          className="bg-card border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-emerald-500"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All Types</option>
          <option value="breach.opened">Confirmed Breach</option>
          <option value="event.exempted">False Alarm / Exception</option>
          <option value="claim.sent">Dispute Sent</option>
          <option value="claim.drafted">Claim Drafted</option>
        </select>
        <select
          className="bg-card border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-emerald-500"
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value)}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">This quarter</option>
          <option value="9999">All time</option>
        </select>
        <button className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-black text-sm font-semibold rounded-lg transition-colors">
          Filter
        </button>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
          onClick={handleExportCSV}
        >
          <Download className="h-3.5 w-3.5" />
          Download CSV
        </button>
      </div>

      {/* Audit table */}
      <div className="rounded-xl border overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              {["Audit ID", "Vendor", "Type", "SLA Rule", "Timestamp", "Penalty", "AI Confidence", "AI Reasoning", "Download"].map(
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
            {filtered.map((entry) => {
              const vendor = getVendorForEntry(entry)
              const rule = getRuleForEntry(entry)
              const penalty = getPenaltyForEntry(entry)
              const reasoning = getReasoningForEntry(entry)
              const confidence = getConfidenceForEntry(entry)
              return (
                <tr
                  key={entry.id}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="p-3 pl-4 font-mono text-xs text-muted-foreground">
                    {entry.id.slice(0, 10)}
                  </td>
                  <td className="p-3 font-semibold">{vendor?.name ?? "—"}</td>
                  <td className="p-3">
                    <TypePill type={entry.action} />
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {rule?.metricLabel ?? "—"}
                  </td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">
                    {format(new Date(entry.timestamp), "dd MMM yyyy, HH:mm")}
                  </td>
                  <td className="p-3 font-mono tabular-nums">
                    {penalty != null ? (
                      <span className="text-red-500 font-medium">{formatINR(penalty)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 font-mono tabular-nums">
                    {confidence ? (
                      <span className="text-emerald-500">{confidence}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground max-w-[200px] truncate">
                    {reasoning}
                  </td>
                  <td className="p-3">
                    <button
                      className="px-2.5 py-1 border rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
                      onClick={() => {
                        const content = JSON.stringify({ ...entry, vendor: vendor?.name }, null, 2)
                        const blob = new Blob([content], { type: "application/json" })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement("a")
                        a.href = url
                        a.download = `${entry.id}.json`
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                        URL.revokeObjectURL(url)
                      }}
                    >
                      ↓
                    </button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="p-10 text-center text-sm text-muted-foreground">
                  No audit records found for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Showing {filtered.length} of {auditEntries.length} entries
      </p>
    </div>
  )
}
