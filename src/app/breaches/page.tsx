"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { AlertTriangle, MoreHorizontal, Eye, Activity } from "lucide-react"
import { PageHeader } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const BASE = "http://localhost:8000/api"

interface Breach {
  id: string
  vendor_id: string
  vendor_name: string
  log_id: string | null
  rule_id: string | null
  order_id: string | null
  metric_name: string | null
  threshold_hours: number | null
  contract_section: string | null
  actual_hours: number
  delay_hours: number
  penalty_amount: number
  dispute_status: string
  confidence: number
  reasoning: string
  breached_at: string
}

interface Vendor {
  id: string
  name: string
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  open:           { label: "Open",           cls: "bg-red-50 text-red-700 border-red-200" },
  pending_review: { label: "Pending Review", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  sent:           { label: "Claim Sent",     cls: "bg-blue-50 text-blue-700 border-blue-200" },
  paid:           { label: "Paid",           cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  disputed:       { label: "Disputed",       cls: "bg-red-50 text-red-700 border-red-200" },
  waived:         { label: "Waived",         cls: "bg-gray-50 text-gray-500 border-gray-200" },
}

const PAGE_SIZE = 25

function formatINR(n: number) {
  if (n === 0) return "—"
  return "INR " + n.toLocaleString("en-IN")
}

export default function BreachesPage() {
  const [breaches, setBreaches] = useState<Breach[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [vendorFilter, setVendorFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const params = new URLSearchParams({ days: "365" })
    if (vendorFilter !== "all") params.set("vendor_id", vendorFilter)
    if (statusFilter !== "all") params.set("status", statusFilter)

    const [breachData, vendorData] = await Promise.all([
      fetch(`${BASE}/breaches/?${params}`).then(r => r.json()).catch(() => []),
      fetch(`${BASE}/vendors/`).then(r => r.json()).catch(() => []),
    ])
    setBreaches(breachData as Breach[])
    setVendors(vendorData as Vendor[])
    setLoading(false)
  }, [vendorFilter, statusFilter])

  useEffect(() => { loadData() }, [loadData])

  const totalOpenPenalty = breaches
    .filter(b => b.dispute_status === "open" || b.dispute_status === "pending_review")
    .reduce((s, b) => s + b.penalty_amount, 0)

  const totalPages = Math.ceil(breaches.length / PAGE_SIZE)
  const paged = breaches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Breaches & Claims"
        description="Detected SLA breaches, penalties, and dispute drafts"
        actions={null}
      />

      {/* Recent breach chips */}
      {breaches.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Recently detected</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {breaches.slice(0, 8).map(b => {
              const sc = statusConfig[b.dispute_status] ?? { label: b.dispute_status, cls: "bg-muted text-muted-foreground border-border" }
              return (
                <Link key={b.id} href={`/breaches/${b.id}`}>
                  <div className="flex-shrink-0 rounded-xl border bg-card p-3 min-w-[190px] cursor-pointer hover:shadow-sm transition-shadow border-red-200">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="font-semibold text-sm truncate">{b.vendor_name ?? "—"}</span>
                      <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${sc.cls}`}>
                        {sc.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {b.metric_name ?? b.order_id ?? "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1.5 font-mono">
                      {new Date(b.breached_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* KPI */}
      <Card>
        <CardContent className="flex items-center gap-3 pt-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total open penalty</p>
            <p className="text-2xl font-semibold tabular-nums">{formatINR(totalOpenPenalty)}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total breaches</p>
            <p className="text-2xl font-semibold tabular-nums">{breaches.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="w-56">
          <Select value={vendorFilter} onValueChange={v => { setVendorFilter(v); setPage(1) }}>
            <SelectTrigger><SelectValue placeholder="All vendors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1) }}>
            <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="sent">Claim Sent</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="disputed">Disputed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground ml-auto">{breaches.length} breach{breaches.length !== 1 ? "es" : ""}</p>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left font-medium p-3 pl-4">Vendor</th>
              <th className="text-left font-medium p-3">Metric</th>
              <th className="text-left font-medium p-3">Order / Ref</th>
              <th className="text-left font-medium p-3">Breach date</th>
              <th className="text-left font-medium p-3">Delay</th>
              <th className="text-right font-medium p-3">Penalty</th>
              <th className="text-left font-medium p-3">Confidence</th>
              <th className="text-left font-medium p-3">Status</th>
              <th className="w-10 p-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                  <Activity className="h-4 w-4 animate-pulse inline mr-2" />Loading breaches…
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-12 text-center text-sm text-muted-foreground">
                  No breaches detected yet. That&apos;s a good sign.
                </td>
              </tr>
            ) : paged.map(b => {
              const sc = statusConfig[b.dispute_status] ?? { label: b.dispute_status, cls: "bg-muted text-muted-foreground" }
              const initials = (b.vendor_name ?? "??").split(" ").map(n => n[0]).join("").slice(0, 2)
              return (
                <tr key={b.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="p-3 pl-4">
                    <Link href={`/breaches/${b.id}`} className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{b.vendor_name ?? "—"}</span>
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    <Link href={`/breaches/${b.id}`} className="block">
                      {b.metric_name ?? "—"}
                      {b.contract_section && <span className="ml-1 text-muted-foreground/60">§{b.contract_section}</span>}
                    </Link>
                  </td>
                  <td className="p-3 font-mono text-xs text-muted-foreground">
                    <Link href={`/breaches/${b.id}`} className="block">{b.order_id ?? "—"}</Link>
                  </td>
                  <td className="p-3 text-muted-foreground tabular-nums">
                    <Link href={`/breaches/${b.id}`} className="block">
                      {new Date(b.breached_at).toLocaleDateString("en-IN")}
                    </Link>
                  </td>
                  <td className="p-3">
                    <Link href={`/breaches/${b.id}`} className="block">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                        b.delay_hours > 12 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        +{b.delay_hours.toFixed(1)}h
                      </span>
                    </Link>
                  </td>
                  <td className="p-3 text-right tabular-nums font-medium">
                    <Link href={`/breaches/${b.id}`} className="block">
                      {formatINR(b.penalty_amount)}
                    </Link>
                  </td>
                  <td className="p-3">
                    <Link href={`/breaches/${b.id}`} className="block">
                      <span className={`text-xs tabular-nums font-medium ${b.confidence >= 90 ? "text-emerald-600" : b.confidence >= 70 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {b.confidence}%
                      </span>
                    </Link>
                  </td>
                  <td className="p-3">
                    <Link href={`/breaches/${b.id}`} className="block">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${sc.cls}`}>
                        {sc.label}
                      </span>
                    </Link>
                  </td>
                  <td className="p-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32">
                        <DropdownMenuItem onClick={() => window.location.href = `/breaches/${b.id}`}>
                          <Eye className="mr-2 h-3.5 w-3.5" /> View
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}
