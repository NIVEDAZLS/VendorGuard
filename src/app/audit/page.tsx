"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import {
  Activity, Search, Download, ChevronDown, ChevronRight,
} from "lucide-react"
import { format } from "date-fns"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/layout"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

const BASE = "http://localhost:8000/api"

interface AuditEntry {
  id: string
  vendor_id: string | null
  breach_id: string | null
  status: string
  confidence: number | null
  reasoning: string | null
  created_at: string
  vendor_name: string | null
  delay_hours: number | null
  penalty_amount: number | null
  metric_name: string | null
  contract_section: string | null
}

interface Vendor {
  id: string
  name: string
}

interface AuditResponse {
  stats: { total: number; confirmed_breaches: number; false_alarms: number }
  entries: AuditEntry[]
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  confirmed:            { label: "Confirmed Breach", cls: "bg-red-50 text-red-700" },
  false_alarm:          { label: "False Alarm",      cls: "bg-slate-100 text-slate-600" },
  needs_human_review:   { label: "Needs Review",     cls: "bg-amber-50 text-amber-700" },
  exception_approved:   { label: "Exception",        cls: "bg-emerald-50 text-emerald-700" },
  dispute_sent:         { label: "Dispute Sent",     cls: "bg-blue-50 text-blue-700" },
}

function AuditPageInner() {
  const router = useRouter()
  const params = useSearchParams()

  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [stats, setStats] = useState({ total: 0, confirmed_breaches: 0, false_alarms: 0 })
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(params.get("q") ?? "")
  const [vendorFilter, setVendorFilter] = useState(params.get("vendor_id") ?? "all")
  const [statusFilter, setStatusFilter] = useState(params.get("status") ?? "all")
  const [dateFrom, setDateFrom] = useState(params.get("date_from") ?? "")
  const [dateTo, setDateTo] = useState(params.get("date_to") ?? "")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Sync filters → URL
  const pushUrl = useCallback((vf: string, sf: string, df: string, dt: string, q: string) => {
    const p = new URLSearchParams()
    if (vf !== "all") p.set("vendor_id", vf)
    if (sf !== "all") p.set("status", sf)
    if (df) p.set("date_from", df)
    if (dt) p.set("date_to", dt)
    if (q) p.set("q", q)
    router.push(`/audit?${p.toString()}`, { scroll: false })
  }, [router])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ days: "365" })
    if (vendorFilter !== "all") p.set("vendor_id", vendorFilter)
    if (statusFilter !== "all") p.set("status", statusFilter)
    if (dateFrom) p.set("date_from", dateFrom)
    if (dateTo) p.set("date_to", dateTo)

    try {
      const [auditRes, vendorRes] = await Promise.all([
        fetch(`${BASE}/audit/?${p}`).then(r => r.json()) as Promise<AuditResponse>,
        fetch(`${BASE}/vendors/`).then(r => r.json()) as Promise<Vendor[]>,
      ])
      setStats(auditRes.stats)
      setEntries(auditRes.entries)
      setVendors(vendorRes)
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [vendorFilter, statusFilter, dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = entries.filter(e => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (e.vendor_name ?? "").toLowerCase().includes(q) ||
      (e.metric_name ?? "").toLowerCase().includes(q) ||
      (e.reasoning ?? "").toLowerCase().includes(q) ||
      (e.breach_id ?? "").toLowerCase().includes(q)
    )
  })

  const handleVendorChange = (v: string) => {
    setVendorFilter(v)
    pushUrl(v, statusFilter, dateFrom, dateTo, search)
  }
  const handleStatusChange = (v: string) => {
    setStatusFilter(v)
    pushUrl(vendorFilter, v, dateFrom, dateTo, search)
  }
  const handleDateFromChange = (v: string) => {
    setDateFrom(v)
    pushUrl(vendorFilter, statusFilter, v, dateTo, search)
  }
  const handleDateToChange = (v: string) => {
    setDateTo(v)
    pushUrl(vendorFilter, statusFilter, dateFrom, v, search)
  }
  const handleSearchChange = (v: string) => {
    setSearch(v)
    pushUrl(vendorFilter, statusFilter, dateFrom, dateTo, v)
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleExportCSV = () => {
    const rows = [
      ["ID", "Timestamp", "Vendor", "Metric", "Status", "Confidence", "Delay (h)", "Penalty", "Reasoning", "Breach ID"].join(","),
      ...filtered.map(e =>
        [
          e.id,
          e.created_at,
          e.vendor_name ?? "",
          e.metric_name ?? "",
          e.status,
          e.confidence ?? "",
          e.delay_hours ?? "",
          e.penalty_amount ?? "",
          (e.reasoning ?? "").replace(/"/g, '""'),
          e.breach_id ?? "",
        ]
          .map(c => `"${c}"`)
          .join(",")
      ),
    ].join("\r\n")

    const blob = new Blob(["﻿" + rows], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Audit Records"
        description="Complete system activity and compliance change history"
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600 tabular-nums">{stats.total}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Audit Records</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-amber-600 tabular-nums">{stats.confirmed_breaches}</p>
          <p className="text-xs text-muted-foreground mt-1">Confirmed Breaches</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold text-muted-foreground tabular-nums">{stats.false_alarms}</p>
          <p className="text-xs text-muted-foreground mt-1">False Alarms</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendor, metric, reasoning…"
            className="pl-8 h-9"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
          />
        </div>

        {/* Vendor filter */}
        <Select value={vendorFilter} onValueChange={handleVendorChange}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="All vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vendors</SelectItem>
            {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed Breach</SelectItem>
            <SelectItem value="false_alarm">False Alarm</SelectItem>
            <SelectItem value="needs_human_review">Needs Review</SelectItem>
            <SelectItem value="exception_approved">Exception</SelectItem>
            <SelectItem value="dispute_sent">Dispute Sent</SelectItem>
          </SelectContent>
        </Select>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="h-9 w-[140px]"
            value={dateFrom}
            onChange={e => handleDateFromChange(e.target.value)}
            placeholder="From"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="date"
            className="h-9 w-[140px]"
            value={dateTo}
            onChange={e => handleDateToChange(e.target.value)}
            placeholder="To"
          />
        </div>

        {/* Export */}
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Activity className="h-4 w-4 animate-pulse" /> Loading audit records…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground gap-2">
          <Activity className="h-8 w-8" />
          <p className="text-sm">{entries.length === 0 ? "No audit records yet." : "No records match your filters."}</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-8 p-3" />
                <th className="text-left font-medium p-3">Timestamp</th>
                <th className="text-left font-medium p-3">Vendor</th>
                <th className="text-left font-medium p-3">SLA Metric</th>
                <th className="text-left font-medium p-3">Status</th>
                <th className="text-right font-medium p-3">Delay (h)</th>
                <th className="text-right font-medium p-3">Penalty</th>
                <th className="text-right font-medium p-3">Conf %</th>
                <th className="text-left font-medium p-3">Breach</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const sc = statusConfig[e.status] ?? { label: e.status, cls: "bg-muted text-muted-foreground" }
                const isExpanded = expanded.has(e.id)
                return (
                  <>
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <button onClick={() => toggleExpand(e.id)} className="text-muted-foreground hover:text-foreground">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="p-3 tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="p-3 font-medium">
                        {e.vendor_id
                          ? <Link href={`/vendors/${e.vendor_id}`} className="hover:underline">{e.vendor_name ?? e.vendor_id}</Link>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {e.metric_name ?? "—"}
                        {e.contract_section && <span className="ml-1 text-muted-foreground/60">§{e.contract_section}</span>}
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sc.cls}`}>{sc.label}</span>
                      </td>
                      <td className="p-3 text-right tabular-nums text-xs">
                        {e.delay_hours != null ? `+${Number(e.delay_hours).toFixed(1)}h` : "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums text-xs font-medium">
                        {e.penalty_amount ? `INR ${Math.round(Number(e.penalty_amount)).toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums text-xs">
                        {e.confidence != null
                          ? <span className={e.confidence >= 90 ? "text-emerald-600" : e.confidence >= 70 ? "text-amber-600" : "text-muted-foreground"}>{e.confidence}%</span>
                          : "—"}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {e.breach_id
                          ? <Link href={`/breaches/${e.breach_id}`} className="text-emerald-600 hover:underline">{e.breach_id.slice(0, 8)}…</Link>
                          : "—"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${e.id}-expanded`} className="border-b last:border-0 bg-muted/20">
                        <td />
                        <td colSpan={8} className="px-4 pb-3 pt-1">
                          <p className="text-xs text-muted-foreground leading-relaxed">{e.reasoning ?? "No reasoning recorded."}</p>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Showing {filtered.length} of {entries.length} entries
      </p>
    </div>
  )
}

export default function AuditPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">Loading…</div>}>
      <AuditPageInner />
    </Suspense>
  )
}
