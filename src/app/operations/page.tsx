"use client"

import { useState, useMemo } from "react"
import { Upload, Database } from "lucide-react"
import { PageHeader } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDataStore } from "@/lib/store"
import { formatINR, timeAgo } from "@/lib/utils/format"
import { UploadOperationsWizard } from "@/components/shared/UploadOperationsWizard"

const statusLabels: Record<string, { label: string; variant: "success" | "secondary" | "warning" | "destructive" | "default" }> = {
  compliant: { label: "Compliant", variant: "success" },
  in_transit: { label: "In transit", variant: "secondary" },
  at_risk: { label: "At risk", variant: "warning" },
  exempted: { label: "Exempted", variant: "default" },
  breached: { label: "Breached", variant: "destructive" },
}

export default function OperationsPage() {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [vendorFilter, setVendorFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const { vendors, dataSources, operationalEvents } = useDataStore()

  const vendorMap = new Map(vendors.map((v) => [v.id, v]))

  // Data sources with event counts
  const sourceStats = dataSources.map((ds) => {
    const v = vendorMap.get(ds.vendorId)
    const eventCount = operationalEvents.filter((e) => e.sourceId === ds.id).length
    return { ...ds, vendorName: v?.name ?? "—", eventCount }
  })

  // Filtered events
  const filteredEvents = useMemo(() => {
    let events = [...operationalEvents].sort(
      (a, b) => new Date(b.shippedAt).getTime() - new Date(a.shippedAt).getTime()
    )
    if (vendorFilter !== "all") {
      events = events.filter((e) => e.vendorId === vendorFilter)
    }
    if (statusFilter !== "all") {
      events = events.filter((e) => e.status === statusFilter)
    }
    return events.slice(0, 50)
  }, [operationalEvents, vendorFilter, statusFilter])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations"
        description="Monitor operational events and data sources"
        actions={
          <Button onClick={() => setWizardOpen(true)} size="sm">
            <Upload className="mr-1.5 h-4 w-4" />
            Upload operational data
          </Button>
        }
      />

      {/* Data source cards */}
      <div>
        <h2 className="text-sm font-medium mb-3">Connected data sources</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sourceStats.map((ds) => (
            <Card key={ds.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-500" />
                    <div>
                      <CardTitle className="text-sm font-medium">
                        {ds.vendorName}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{ds.name}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Events ingested</span>
                  <span className="font-medium tabular-nums">{ds.eventCount}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Last ingested</span>
                  <span className="font-medium tabular-nums">
                    {ds.lastIngestedAt ? timeAgo(ds.lastIngestedAt) : "Never"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
          {sourceStats.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No data sources configured
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
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
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
              <SelectItem value="compliant">Compliant</SelectItem>
              <SelectItem value="in_transit">In transit</SelectItem>
              <SelectItem value="at_risk">At risk</SelectItem>
              <SelectItem value="breached">Breached</SelectItem>
              <SelectItem value="exempted">Exempted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Events table */}
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left font-medium p-3 pl-4">Vendor</th>
              <th className="text-left font-medium p-3">Order ID</th>
              <th className="text-left font-medium p-3">Shipped</th>
              <th className="text-left font-medium p-3">Deadline</th>
              <th className="text-left font-medium p-3">Status</th>
              <th className="text-right font-medium p-3 pr-4">Value</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.map((e) => {
              const v = vendorMap.get(e.vendorId)
              const s = statusLabels[e.status] ?? { label: e.status, variant: "default" }
              return (
                <tr
                  key={e.id}
                  className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="p-3 pl-4 font-medium">{v?.name ?? "—"}</td>
                  <td className="p-3 text-muted-foreground tabular-nums">{e.externalId}</td>
                  <td className="p-3 text-muted-foreground tabular-nums">
                    {new Date(e.shippedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td className="p-3 text-muted-foreground tabular-nums">
                    {new Date(e.deadlineAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td className="p-3">
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </td>
                  <td className="p-3 pr-4 text-right tabular-nums font-medium">
                    {formatINR(e.orderValue)}
                  </td>
                </tr>
              )
            })}
            {filteredEvents.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  No events found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <UploadOperationsWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  )
}
