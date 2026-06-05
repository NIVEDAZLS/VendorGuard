"use client"
import { BASE } from "@/lib/api/base"

import { useState, useEffect, useCallback } from "react"
import { Database, Activity } from "lucide-react"
import { PageHeader } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { VendorAPI } from "@/lib/api"
import type { Vendor } from "@/lib/types"


interface OpLog {
  id: string
  vendor_id: string
  vendor_name: string
  event_type: string
  external_id: string
  started_at: string
  completed_at: string | null
  duration_hours: number | null
  status: "in_progress" | "completed"
  metadata: Record<string, unknown>
}

interface VendorSummary {
  vendor_id: string
  vendor_name: string
  total: number
  in_progress: number
  completed: number
  latest: string | null
}

const statusConfig: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "destructive" | "default" }> = {
  completed:   { label: "Completed",   variant: "success" },
  in_progress: { label: "In Progress", variant: "warning" },
}

function formatEventType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

function formatDuration(hours: number | null): string {
  if (hours === null) return "—"
  if (hours < 1) return `${Math.round(hours * 60)} min`
  return `${hours.toFixed(1)}h`
}

export default function OperationsPage() {
  const [vendorFilter, setVendorFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [logs, setLogs] = useState<OpLog[]>([])
  const [summary, setSummary] = useState<VendorSummary[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    const params = new URLSearchParams({ limit: "200" })
    if (vendorFilter !== "all") params.set("vendor_id", vendorFilter)

    const [logsData, summaryData, vendorsData] = await Promise.all([
      fetch(`${BASE}/operations/?${params}`).then(r => r.json()).catch(() => []),
      fetch(`${BASE}/operations/summary`).then(r => r.json()).catch(() => []),
      VendorAPI.list().catch(() => []),
    ])

    let filtered = logsData as OpLog[]
    if (statusFilter !== "all") {
      filtered = filtered.filter(l => l.status === statusFilter)
    }

    setLogs(filtered)
    setSummary(summaryData as VendorSummary[])
    setVendors(vendorsData)
    setLoading(false)
  }, [vendorFilter, statusFilter])

  useEffect(() => { loadData() }, [loadData])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations"
        description="Real-time operational log events from vendor systems"
        actions={null}
      />

      {/* Vendor summary cards */}
      <div>
        <h2 className="text-sm font-medium mb-3">Vendor activity summary</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summary.map((s) => (
            <Card key={s.vendor_id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-medium truncate">{s.vendor_name}</CardTitle>
                    <p className="text-xs text-muted-foreground font-mono">{s.vendor_id}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total events</span>
                  <span className="font-semibold tabular-nums">{s.total.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">In progress</span>
                  <span className="font-semibold tabular-nums text-amber-600">{s.in_progress}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completed</span>
                  <span className="font-semibold tabular-nums text-emerald-600">{s.completed.toLocaleString()}</span>
                </div>
                {s.latest && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Latest event</span>
                    <span className="tabular-nums">
                      {new Date(s.latest).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {summary.length === 0 && !loading && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No operational logs found
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="w-56">
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground ml-auto">
          Showing {logs.length} events
        </p>
      </div>

      {/* Events table */}
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left font-medium p-3 pl-4">Vendor</th>
              <th className="text-left font-medium p-3">Event type</th>
              <th className="text-left font-medium p-3">Reference ID</th>
              <th className="text-left font-medium p-3">Started</th>
              <th className="text-left font-medium p-3">Duration</th>
              <th className="text-left font-medium p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  <Activity className="h-4 w-4 animate-pulse inline mr-2" />
                  Loading events…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  No events found
                </td>
              </tr>
            ) : (
              logs.map(log => {
                const s = statusConfig[log.status] ?? { label: log.status, variant: "default" as const }
                return (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="p-3 pl-4 font-medium">{log.vendor_name}</td>
                    <td className="p-3 text-muted-foreground">{formatEventType(log.event_type)}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{log.external_id}</td>
                    <td className="p-3 text-muted-foreground tabular-nums">
                      {new Date(log.started_at).toLocaleDateString("en-IN", {
                        day: "numeric", month: "short", year: "2-digit",
                      })}
                    </td>
                    <td className="p-3 tabular-nums text-muted-foreground">
                      {formatDuration(log.duration_hours)}
                    </td>
                    <td className="p-3">
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
